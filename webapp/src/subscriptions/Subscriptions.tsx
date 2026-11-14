import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../auth/client";
import type { Workspace } from "../auth/types";
import { useResource } from "../admin/useResource";
import { CompanyStatus } from "../admin/components";
import type { Company } from "../admin/types";
import {
  Button,
  Card,
  Field as Input,
  Select,
  Textarea,
  ErrorState,
  Skeleton,
  Stat,
  Badge,
} from "../design/ui";
import { ConfirmAction, type AdminAction } from "../admin/ConfirmAction";
import "../admin/admin.css";
type Price = {
  id: string;
  amount: string;
  currency: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
};
type Plan = {
  plan: { name: string } | null;
  current: Price | null;
  history: Price[];
};
type Period = {
  id: string;
  paymentId: string | null;
  startsAt: string;
  endsAt: string;
  amountApplied: string;
  currency: string;
  company?: { name: string };
};
type Payment = {
  id: string;
  companyId: string;
  amount: string;
  currency: string;
  method: string;
  externalReference: string | null;
  paidAt: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  validatedAt: string | null;
  rejectionReason: string | null;
  company: { name: string; reference: string; status?: string };
  subscriptionPeriod_paymentRecords: Period[];
};
type Page<T> = { items: T[]; total: number; page: number; size: number };
type Overview = {
  active: number;
  expired: number;
  soon: number;
  none: number;
  pending: number;
  approved: number;
  amounts: { amount: string; currency: string }[];
};
const labels: Record<string, string> = {
  NONE: "Non souscrit",
  PENDING: "En attente de validation",
  ACTIVE: "Actif",
  EXPIRED: "Expiré",
  SOON: "Échéance à trois jours",
  SUSPENDED: "Suspendu",
  CANCELLED: "Résilié",
  APPROVED: "Confirmé",
  REJECTED: "Rejeté",
  MTN_MOBILE_MONEY: "MTN Mobile Money",
  ORANGE_MONEY: "Orange Money",
  BANK_TRANSFER: "Virement",
  CASH: "Espèces",
  OTHER: "Autre",
};
const label = (s: string) => labels[s] ?? s;
const date = (s: string | null) =>
  s ? new Date(s).toLocaleString("fr-FR", { timeZone: "UTC" }) + " UTC" : "—";
const base = "/portail/super-admin";
function Pager({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (v: number) => void;
}) {
  return (
    <div className="admin-toolbar">
      <Button
        variant="secondary"
        disabled={page === 1}
        onClick={() => setPage(page - 1)}
      >
        Précédent
      </Button>
      <span>
        Page {page} · {total} résultat(s)
      </span>
      <Button
        variant="secondary"
        disabled={page * 15 >= total}
        onClick={() => setPage(page + 1)}
      >
        Suivant
      </Button>
    </div>
  );
}
export function SubscriptionOverview({ days = "30" }: { days?: string }) {
  const r = useResource<Overview>(`/admin/subscriptions/overview?days=${days}`);
  if (r.error) return <ErrorState message={r.error} retry={r.reload} />;
  if (!r.data) return <Skeleton rows={2} />;
  const v = r.data;
  return (
    <Card title="Abonnements et règlements externes">
      <div className="ws-stats">
        {(
          [
            ["Abonnements actifs", v.active],
            ["Entreprises non souscrites", v.none],
            ["Abonnements expirés", v.expired],
            ["Échéances à trois jours", v.soon],
            ["Règlements en attente", v.pending],
            ["Règlements confirmés sur la période", v.approved],
          ] as const
        ).map(([name, value]) => (
          <Stat
            key={name}
            label={name}
            value={value}
            detail="Calculé depuis MySQL"
          />
        ))}
      </div>
      <p>
        Montants externes confirmés :{" "}
        {v.amounts.length
          ? v.amounts.map((a) => `${a.amount} ${a.currency}`).join(" · ")
          : "Aucun sur cette période."}
      </p>
      <p className="ws-disclaimer">
        Règlements vérifiés hors plateforme. DND Delivery ne réalise aucun
        encaissement électronique.
      </p>
    </Card>
  );
}
function PlanPage() {
  const r = useResource<Plan>("/admin/subscription-plan");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  if (r.error) return <ErrorState message={r.error} retry={r.reload} />;
  if (!r.data) return <Skeleton />;
  const data = r.data;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/admin/subscription-plan", {
        method: "PATCH",
        body: JSON.stringify({
          name: f.get("name"),
          amount: f.get("amount"),
          currency: String(f.get("currency")).toUpperCase(),
          expectedPriceId: data.history[0]?.id ?? null,
          ...(f.get("from")
            ? {
                effectiveFrom: new Date(
                  String(f.get("from")) + "Z",
                ).toISOString(),
              }
            : {}),
        }),
      });
      setNotice("Nouvelle version du tarif enregistrée.");
      r.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Tarif mensuel unique</h1>
      <p>
        Un abonnement par entreprise, quel que soit son nombre d’agences. Les
        versions déjà appliquées restent conservées.
      </p>
      {notice && <p role="status">{notice}</p>}
      <Card title="Tarif actuel">
        {data.current ? (
          <p>
            {data.current.amount} {data.current.currency} / mois · depuis{" "}
            {date(data.current.effectiveFrom)}
          </p>
        ) : (
          <p>Aucun tarif applicable. Configurez la première version.</p>
        )}
        <form
          key={data.history[0]?.id ?? "new"}
          className="admin-form"
          onSubmit={submit}
        >
          <Input
            label="Nom du plan"
            name="name"
            defaultValue={data.plan?.name ?? "Abonnement mensuel DND Delivery"}
            required
            maxLength={120}
          />
          <Input
            label="Montant exact"
            name="amount"
            inputMode="decimal"
            placeholder="Montant à configurer"
            required
            pattern="[0-9]+([.][0-9]{1,4})?"
          />
          <Input
            label="Devise ISO"
            name="currency"
            required
            minLength={3}
            maxLength={3}
            defaultValue={data.current?.currency}
          />
          <Input
            label="Application (UTC, vide = maintenant)"
            type="datetime-local"
            name="from"
          />
          <p>
            Une nouvelle période utilise le tarif en vigueur lors de sa
            validation. Un montant différent doit être rejeté et corrigé. Les
            tarifs programmés sont appliqués dans l’ordre chronologique.
          </p>
          {error && <p role="alert">{error}</p>}
          <Button type="submit" busy={busy}>
            Enregistrer une nouvelle version
          </Button>
        </form>
      </Card>
      <Card title="Historique des tarifs">
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead>
              <tr>
                <th>Montant mensuel</th>
                <th>Début d’application</th>
                <th>Fin d’application</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.amount} {p.currency}
                  </td>
                  <td>{date(p.effectiveFrom)}</td>
                  <td>{date(p.effectiveUntil)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
function Payments({ company = false }: { company?: boolean }) {
  const [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [q, setQ] = useState("");
  const r = useResource<Page<Payment>>(
    `${company ? "/company/subscription/payments" : "/admin/subscription-payments"}?page=${page}&size=15${status ? "&status=" + status : ""}&q=${encodeURIComponent(q)}`,
  );
  return (
    <Card title="Déclarations de règlements externes">
      <div className="admin-toolbar">
        {!company && (
          <Input
            label="Recherche par entreprise"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        )}
        <Select
          label="Validation"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Toutes</option>
          {["PENDING", "APPROVED", "REJECTED"].map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </Select>
      </div>
      {r.error ? (
        <ErrorState message={r.error} retry={r.reload} />
      ) : !r.data ? (
        <Skeleton />
      ) : (
        <>
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Entreprise</th>
                  <th>Montant</th>
                  <th>Moyen / référence</th>
                  <th>Date déclarée</th>
                  <th>Validation</th>
                  <th>Détail</th>
                </tr>
              </thead>
              <tbody>
                {r.data.items.map((p) => (
                  <tr key={p.id}>
                    <td>{p.company.name}</td>
                    <td>
                      {p.amount} {p.currency}
                    </td>
                    <td>
                      {label(p.method)} · {p.externalReference ?? "—"}
                    </td>
                    <td>{date(p.paidAt)}</td>
                    <td>
                      <Badge>{label(p.status)}</Badge>
                    </td>
                    <td>
                      <Link
                        to={
                          company
                            ? `/portail/entreprise/abonnement/${p.id}`
                            : `${base}/paiements/${p.id}`
                        }
                      >
                        Consulter
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!r.data.items.length && <p>Aucune déclaration.</p>}
          <Pager page={page} total={r.data.total} setPage={setPage} />
        </>
      )}
    </Card>
  );
}
function Periods({ company = false }: { company?: boolean }) {
  const [page, setPage] = useState(1);
  const r = useResource<Page<Period>>(
    `${company ? "/company/subscription/history" : "/admin/subscription-history"}?page=${page}`,
  );
  return (
    <Card title="Historique des périodes accordées">
      {r.error ? (
        <ErrorState message={r.error} retry={r.reload} />
      ) : !r.data ? (
        <Skeleton />
      ) : (
        <>
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Entreprise</th>
                  <th>Début inclus</th>
                  <th>Fin exclue</th>
                  <th>Tarif appliqué</th>
                  <th>Paiement</th>
                </tr>
              </thead>
              <tbody>
                {r.data.items.map((p) => (
                  <tr key={p.id}>
                    <td>{p.company?.name}</td>
                    <td>{date(p.startsAt)}</td>
                    <td>{date(p.endsAt)}</td>
                    <td>
                      {p.amountApplied} {p.currency}
                    </td>
                    <td>
                      {p.paymentId ? (
                        <Link
                          to={
                            company
                              ? `/portail/entreprise/abonnement/${p.paymentId}`
                              : `${base}/paiements/${p.paymentId}`
                          }
                        >
                          Déclaration
                        </Link>
                      ) : (
                        "Historique antérieur"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!r.data.items.length && <p>Aucune période accordée.</p>}
          <Pager page={page} total={r.data.total} setPage={setPage} />
        </>
      )}
    </Card>
  );
}
function PaymentDetail({
  id,
  company = false,
}: {
  id: string;
  company?: boolean;
}) {
  const r = useResource<Payment>(
      `${company ? "/company/subscription/payments" : "/admin/subscription-payments"}/${id}`,
    ),
    [action, setAction] = useState<AdminAction | null>(null),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (r.error) return <ErrorState message={r.error} retry={r.reload} />;
  if (!r.data) return <Skeleton />;
  const p = r.data;
  async function preview() {
    setBusy(true);
    setError("");
    try {
      const v = await api<{
        startsAt: string;
        endsAt: string;
        price: Price;
        previewToken: string;
      }>(`/admin/subscription-payments/${id}/preview`);
      setAction({
        title: "Confirmer le règlement vérifié hors plateforme",
        description: `${p.company.name} · ${p.amount} ${p.currency} · ${label(p.method)} · référence ${p.externalReference ?? "non fournie"}. Période accordée : ${date(v.startsAt)} à ${date(v.endsAt)} (fin exclue). Vérifiez humainement la réalité de ce règlement. Le statut administratif de l’entreprise reste indépendant.`,
        submit: () =>
          api(`/admin/subscription-payments/${id}/approve`, {
            method: "POST",
            body: JSON.stringify({ previewToken: v.previewToken }),
          }),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Déclaration de règlement</h1>
      {notice && <p role="status">{notice}</p>}
      <Card title={p.company.name}>
        <Badge>{label(p.status)}</Badge>
        <dl className="admin-details">
          <dt>Montant</dt>
          <dd>
            {p.amount} {p.currency}
          </dd>
          <dt>Moyen externe</dt>
          <dd>{label(p.method)}</dd>
          <dt>Référence déclarée</dt>
          <dd>{p.externalReference ?? "Non fournie"}</dd>
          <dt>Date de règlement déclarée</dt>
          <dd>{date(p.paidAt)}</dd>
          <dt>Enregistrement serveur</dt>
          <dd>{date(p.createdAt)}</dd>
          <dt>Commentaire</dt>
          <dd>{p.notes ?? "—"}</dd>
          <dt>Traitement</dt>
          <dd>{date(p.validatedAt)}</dd>
          {p.rejectionReason && (
            <>
              <dt>Motif de rejet</dt>
              <dd>{p.rejectionReason}</dd>
            </>
          )}
        </dl>
        {p.subscriptionPeriod_paymentRecords.map((v) => (
          <p key={v.id}>
            Période accordée : {date(v.startsAt)} → {date(v.endsAt)} ·{" "}
            {v.amountApplied} {v.currency}
          </p>
        ))}
        {!company && p.status === "PENDING" && (
          <div className="ds-actions">
            <Button busy={busy} onClick={preview}>
              Vérifier et valider
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                setAction({
                  title: "Rejeter cette déclaration",
                  description: `${p.company.name} · ${p.amount} ${p.currency}. Aucun droit d’abonnement ne sera accordé.`,
                  reason: true,
                  submit: (reason) =>
                    api(`/admin/subscription-payments/${id}/reject`, {
                      method: "POST",
                      body: JSON.stringify({ reason }),
                    }),
                })
              }
            >
              Rejeter avec motif
            </Button>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </Card>
      {action && (
        <ConfirmAction
          action={action}
          close={() => setAction(null)}
          done={(m) => {
            setNotice(m);
            r.reload();
          }}
        />
      )}
      <Link
        to={company ? "/portail/entreprise/abonnement" : `${base}/paiements`}
      >
        Retour aux déclarations
      </Link>
    </>
  );
}
function Declaration() {
  const navigate = useNavigate(),
    [key] = useState(() => crypto.randomUUID()),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const p = await api<{ id: string }>("/company/subscription/payments", {
        method: "POST",
        body: JSON.stringify({
          amount: f.get("amount"),
          currency: String(f.get("currency")).toUpperCase(),
          method: f.get("method"),
          externalReference: f.get("reference") || null,
          paidAt: new Date(String(f.get("paidAt")) + "Z").toISOString(),
          notes: f.get("notes") || null,
          idempotencyKey: key,
        }),
      });
      navigate(`/portail/entreprise/abonnement/${p.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Déclarer un règlement externe</h1>
      <Card title="Règlement déjà effectué">
        <p>
          DND Delivery n’exécute aucun paiement. Cette déclaration attendra une
          vérification humaine et n’activera pas votre abonnement.
        </p>
        <form className="admin-form" onSubmit={submit}>
          <Input
            name="amount"
            label="Montant payé exact"
            required
            inputMode="decimal"
            pattern="[0-9]+([.][0-9]{1,4})?"
          />
          <Input
            name="currency"
            label="Devise ISO"
            required
            minLength={3}
            maxLength={3}
          />
          <Select name="method" label="Moyen de règlement">
            {[
              "MTN_MOBILE_MONEY",
              "ORANGE_MONEY",
              "BANK_TRANSFER",
              "CASH",
              "OTHER",
            ].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </Select>
          <Input
            name="reference"
            label="Référence externe (facultatif)"
            maxLength={120}
          />
          <Input
            type="datetime-local"
            name="paidAt"
            label="Date du règlement (UTC)"
            required
          />
          <Textarea
            name="notes"
            label="Commentaire (facultatif)"
            maxLength={2000}
          />
          {error && <p role="alert">{error}</p>}
          <Button type="submit" busy={busy}>
            Enregistrer la déclaration
          </Button>
        </form>
      </Card>
    </>
  );
}
type CompanySubscription = {
  currentPeriod: Period | null;
  company: { name: string; status: Company["status"] };
  status: string;
  daysRemaining: number;
  subscription: { startedAt: string | null; expiresAt: string | null } | null;
  plan: Plan;
};
function CompanySubscriptionPage({ context }: { context: Workspace }) {
  const r = useResource<CompanySubscription>("/company/subscription");
  if (r.error) return <ErrorState message={r.error} retry={r.reload} />;
  if (!r.data) return <Skeleton />;
  const v = r.data;
  return (
    <>
      <h1>Mon abonnement</h1>
      <Card title={v.company.name}>
        <Badge>{label(v.status)}</Badge>
        <p>
          Statut administratif : <CompanyStatus status={v.company.status} />
        </p>
        <p>
          Tarif mensuel actuel :{" "}
          {v.plan.current
            ? `${v.plan.current.amount} ${v.plan.current.currency}`
            : "Non configuré"}
        </p>
        <p>
          Début de la période : {date(v.currentPeriod?.startsAt ?? null)} ·
          Expiration : {date(v.subscription?.expiresAt ?? null)} ·{" "}
          {v.daysRemaining} jour(s) restant(s)
        </p>
        {v.status !== "ACTIVE" ? (
          <p role="status">
            Les nouvelles opérations sont bloquées. Vos données sont conservées.
            Déclarez un règlement effectué hors plateforme pour demander le
            renouvellement.
          </p>
        ) : (
          v.daysRemaining <= 3 && (
            <p role="status">
              Votre échéance approche. Déclarez votre renouvellement après
              règlement.
            </p>
          )
        )}
        <p>
          Réglez le tarif indiqué par le moyen externe convenu avec DND Delivery
          (MTN Mobile Money, Orange Money, virement ou espèces), puis déclarez
          le règlement. La validation reste manuelle.
        </p>
        {context.permissions.includes("subscriptions.declare") && (
          <Link
            className="ds-button ds-primary"
            to="/portail/entreprise/abonnement/declarer"
          >
            Déclarer un paiement déjà effectué
          </Link>
        )}
      </Card>
      <Payments company />
      <Periods company />
    </>
  );
}
function SubscriptionsList() {
  const [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [status, setStatus] = useState("");
  type Row = {
    id: string;
    name: string;
    reference: string;
    status: Company["status"];
    subscriptionStatus: string;
    subscription: { expiresAt: string | null } | null;
  };
  const r = useResource<Page<Row>>(
    `/admin/subscriptions?page=${page}&q=${encodeURIComponent(q)}${status ? "&status=" + status : ""}`,
  );
  return (
    <Card title="Entreprises et abonnements">
      <div className="admin-toolbar">
        <Input
          label="Entreprise ou référence"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label="État de l’abonnement"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tous</option>
          {["ACTIVE", "NONE", "EXPIRED", "SOON", "SUSPENDED", "CANCELLED"].map(
            (s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ),
          )}
        </Select>
      </div>
      {r.error ? (
        <ErrorState message={r.error} retry={r.reload} />
      ) : !r.data ? (
        <Skeleton />
      ) : (
        <>
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Entreprise</th>
                  <th>Statut administratif</th>
                  <th>Abonnement</th>
                  <th>Expiration</th>
                </tr>
              </thead>
              <tbody>
                {r.data.items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`${base}/entreprises/${c.id}`}>{c.name}</Link>
                      <br />
                      {c.reference}
                    </td>
                    <td>
                      <CompanyStatus status={c.status} />
                    </td>
                    <td>{label(c.subscriptionStatus)}</td>
                    <td>{date(c.subscription?.expiresAt ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!r.data.items.length && <p>Aucune entreprise correspondante.</p>}
          <Pager page={page} total={r.data.total} setPage={setPage} />
        </>
      )}
    </Card>
  );
}
function NotificationJournal() {
  const [page, setPage] = useState(1);
  type Row = {
    id: string;
    company: { name: string };
    recipientAddress: string;
    sourceEvent: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    availableAt: string;
    sentAt: string | null;
    lastError: string | null;
  };
  const r = useResource<Page<Row>>(
    `/admin/subscriptions/notifications?page=${page}`,
  );
  return (
    <Card title="Journal des notifications d’abonnement">
      {r.error ? (
        <ErrorState message={r.error} retry={r.reload} />
      ) : !r.data ? (
        <Skeleton />
      ) : (
        <>
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Entreprise / destinataire</th>
                  <th>Événement</th>
                  <th>État</th>
                  <th>Tentatives</th>
                  <th>Prochaine tentative / envoi</th>
                  <th>Diagnostic</th>
                </tr>
              </thead>
              <tbody>
                {r.data.items.map((n) => (
                  <tr key={n.id}>
                    <td>
                      {n.company.name}
                      <br />
                      {n.recipientAddress}
                    </td>
                    <td>{n.sourceEvent}</td>
                    <td>{n.status}</td>
                    <td>
                      {n.attempts}/{n.maxAttempts}
                    </td>
                    <td>{date(n.sentAt ?? n.availableAt)}</td>
                    <td>{n.lastError ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!r.data.items.length && <p>Aucune notification.</p>}
          <Pager page={page} total={r.data.total} setPage={setPage} />
        </>
      )}
    </Card>
  );
}
export function SubscriptionWorkspace({
  context,
  moduleId,
}: {
  context: Workspace;
  moduleId: string;
}) {
  const { entityId } = useParams();
  if (context.scope !== "GLOBAL") {
    if (entityId === "declarer") return <Declaration />;
    if (entityId) return <PaymentDetail id={entityId} company />;
    return <CompanySubscriptionPage context={context} />;
  }
  if (moduleId === "paiements")
    return entityId ? (
      <PaymentDetail id={entityId} />
    ) : (
      <>
        <h1>Règlements externes déclarés</h1>
        <Payments />
      </>
    );
  if (entityId === "tarif") return <PlanPage />;
  if (entityId === "notifications") return <NotificationJournal />;
  if (entityId === "historique")
    return (
      <>
        <h1>Renouvellements</h1>
        <Periods />
      </>
    );
  return (
    <>
      <header className="ws-page-title">
        <div>
          <h1>Abonnements DND Delivery</h1>
          <p>
            Une offre mensuelle unique. Validation humaine des règlements
            externes.
          </p>
        </div>
      </header>
      <div className="ds-actions">
        <Link to={`${base}/abonnements/tarif`}>Configurer le tarif</Link>
        <Link to={`${base}/abonnements/historique`}>
          Historique des renouvellements
        </Link>
        <Link to={`${base}/paiements`}>Traiter les paiements</Link>
        <Link to={`${base}/abonnements/notifications`}>
          Journal des notifications
        </Link>
      </div>
      <SubscriptionOverview />
      <SubscriptionsList />
    </>
  );
}
export function RestrictedSubscription({ context }: { context: Workspace }) {
  return (
    <Card title="Accès limité à cette entreprise">
      <p>
        Abonnement : {label(context.subscriptionAccess?.status ?? "NONE")}. Les
        nouvelles opérations sont bloquées; vos données et affiliations sont
        conservées.
      </p>
      <p>
        La consultation des opérations existantes et la clôture sécurisée des
        colis déjà pris en charge restent soumises aux droits de votre rôle.
      </p>
      {context.scope === "COMPANY" &&
        context.permissions.includes("subscriptions.read") && (
          <Link
            className="ds-button ds-primary"
            to="/portail/entreprise/abonnement"
          >
            Consulter mon abonnement et déclarer un règlement
          </Link>
        )}
      <Link className="ds-button ds-secondary" to="/organisations">
        Changer d’entreprise
      </Link>
      <Link to="/profil">Mon compte</Link>
    </Card>
  );
}
