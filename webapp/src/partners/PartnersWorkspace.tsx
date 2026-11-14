import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Building2, Store, ArrowUpRight } from "lucide-react";
import { api } from "../auth/client";
import { useAuth } from "../auth/AuthProvider";
import { partnerActionLabels } from "../../../shared/partners";
import type { Workspace } from "../auth/types";
import { useResource } from "../admin/useResource";
import { ConfirmAction, type AdminAction } from "../admin/ConfirmAction";
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Select,
  Skeleton,
  Textarea,
} from "../design/ui";
import "../admin/admin.css";
import "./partners.css";

type Page<T> = { items: T[]; total: number; page: number; size: number };
type Partner = {
  id: string;
  reference: string;
  name: string;
  tradeName?: string | null;
  legalName?: string | null;
  description?: string | null;
  email: string;
  phone: string;
  address: string;
  countryCode: string;
  city: string;
  district?: string | null;
  logoUrl?: string | null;
  version: number;
  status: string;
};
type History = {
  id: string;
  action: string;
  createdAt: string;
  actor?: { fullName: string } | null;
  metadata?: { reason?: string; changedFields?: string[] } | null;
};
type Collaboration = {
  id: string;
  shopId: string;
  companyId: string;
  status: string;
  origin: "SHOP" | "COMPANY";
  version: number;
  reason: string | null;
  requestedAt: string;
  acceptedAt: string | null;
  suspendedAt: string | null;
  endedAt: string | null;
  shop: Partner;
  company: Partner;
  agencies?: { id: string; name: string; city: string }[];
  history?: History[];
  openOperations?: {
    stockLocations: number;
    openOrders: number;
    openDeliveries: number;
    openTransfers: number;
  };
  allowedAgencyIds?: string[] | null;
};
type Member = {
  id: string;
  userId: string;
  role: string;
  active: boolean;
  version: number;
  user: { id: string; email: string; fullName: string; phone: string | null };
};
type Invitation = {
  id: string;
  email: string;
  fullName?: string;
  name?: string;
  shopName?: string;
  role?: string;
  status: string;
  deliveryStatus?: string;
  createdAt: string;
  expiresAt: string;
  version?: number;
};
const statuses: Record<string, string> = {
  PENDING: "En attente",
  ACTIVE: "Active",
  REJECTED: "Refusée",
  SUSPENDED: "Suspendue",
  ENDED: "Terminée",
  INACTIVE: "Inactive",
  SENT: "Envoyée",
  FAILED: "Échec d’envoi",
  ACCEPTED: "Acceptée",
  REVOKED: "Révoquée",
  EXPIRED: "Expirée",
};
const roles: Record<string, string> = {
  shop_owner: "Propriétaire",
  shop_manager: "Gestionnaire",
  shop_employee: "Employé",
};
const actions: Record<string, string> = {
  PARTNER_CREATED: "Boutique créée",
  PARTNER_UPDATED: "Profil modifié",
  PARTNER_LOGO_UPDATED: "Logo modifié",
  PARTNER_USER_INVITED: "Utilisateur invité",
  PARTNER_USER_UPDATED: "Affiliation modifiée",
  PARTNER_USER_REMOVED: "Affiliation retirée",
  COLLABORATION_REQUESTED: "Collaboration demandée",
  COLLABORATION_ACCEPTED: "Collaboration acceptée",
  COLLABORATION_REJECTED: "Collaboration refusée",
  COLLABORATION_SUSPENDED: "Collaboration suspendue",
  COLLABORATION_TERMINATED: "Collaboration terminée",
};
const date = (v?: string | null) =>
  v ? new Date(v).toLocaleString("fr-FR") : "—";
function Status({ value }: { value: string }) {
  return (
    <Badge
      tone={
        value === "ACTIVE"
          ? "success"
          : value === "PENDING"
            ? "warning"
            : ["SUSPENDED", "FAILED", "REJECTED"].includes(value)
              ? "danger"
              : "neutral"
      }
    >
      {statuses[value] ?? value}
    </Badge>
  );
}
function Pager({
  page,
  total,
  size = 15,
  change,
}: {
  page: number;
  total: number;
  size?: number;
  change: (p: number) => void;
}) {
  return (
    <div className="admin-toolbar">
      <Button
        type="button"
        variant="secondary"
        disabled={page <= 1}
        onClick={() => change(page - 1)}
      >
        Précédent
      </Button>
      <span>
        Page {page} · {total} résultat(s)
      </span>
      <Button
        type="button"
        variant="secondary"
        disabled={page * size >= total}
        onClick={() => change(page + 1)}
      >
        Suivant
      </Button>
    </div>
  );
}
function Feedback({ error, notice }: { error?: string; notice?: string }) {
  return (
    <>
      {error && (
        <p role="alert" className="ds-error-text">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="partner-notice">
          {notice}
        </p>
      )}
    </>
  );
}
async function invitationAction(path: string, body: object) {
  const result = await api<{ deliveryStatus?: string; message?: string }>(
    path,
    { method: "POST", body: JSON.stringify(body) },
  );
  return { ...result, invitationDelivery: result.deliveryStatus };
}
function Resource({
  error,
  loading,
  reload,
  children,
}: {
  error?: string;
  loading: boolean;
  reload: () => void;
  children: ReactNode;
}) {
  return error ? (
    <ErrorState message={error} retry={reload} />
  ) : loading ? (
    <Skeleton />
  ) : (
    <>{children}</>
  );
}
function Logo({ url, name }: { url?: string | null; name: string }) {
  const [src, setSrc] = useState<string>(),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    api<{ mime: string; image: string }>(url.replace(/^\/api/, ""), {
      signal: controller.signal,
    })
      .then((b) => {
        if (!controller.signal.aborted)
          setSrc(`data:${b.mime};base64,${b.image}`);
      })
      .catch(() => setFailed(true));
    return () => {
      controller.abort();
    };
  }, [url]);
  return src && !failed ? (
    <img className="partner-logo" alt={`Logo ${name}`} src={src} />
  ) : (
    <span className="partner-logo partner-logo-fallback">
      <Store size={24} />
    </span>
  );
}
function Identity({ p }: { p: Partner }) {
  return (
    <div className="partner-identity">
      <Logo url={p.logoUrl} name={p.name} />
      <div>
        <h2>{p.tradeName ?? p.name}</h2>
        <small>
          {p.reference} · {p.city}
          {p.countryCode ? ` · ${p.countryCode}` : ""}
        </small>
      </div>
    </div>
  );
}
function CarrierPicker({ context }: { context: Workspace }) {
  const auth = useAuth(),
    navigate = useNavigate(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const options = (auth.profile?.organizations ?? []).filter(
    (x) => x.scope === "SHOP" && x.shopId === context.shopId,
  );
  async function choose(key: string) {
    setBusy(true);
    setError("");
    try {
      const p = await auth.select(key);
      navigate(`/portail/${p.activeContext?.portal ?? "boutique"}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Votre transporteur">
      <Select
        label="Contexte de travail"
        value={context.key}
        disabled={busy}
        onChange={(e) => void choose(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.companyId
              ? `${o.companyName}${o.subscriptionAccess?.valid === false ? " · accès limité" : ""}`
              : "Ma boutique · sans transporteur"}
          </option>
        ))}
      </Select>
      <p className="partner-help">
        Seules les collaborations autorisées sont proposées. Vous pouvez gérer
        votre boutique sans sélectionner de transporteur.
      </p>
      <Feedback error={error} />
    </Card>
  );
}

function ShopProfile({ context }: { context: Workspace }) {
  const r = useResource<Partner>("/partners/profile"),
    [edit, setEdit] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const can = context.permissions.includes("shop.profile.write");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!r.data) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const fields = Object.fromEntries(
        [
          "name",
          "legalName",
          "description",
          "email",
          "phone",
          "address",
          "countryCode",
          "city",
          "district",
        ].map((k) => [
          k,
          ["legalName", "description"].includes(k)
            ? String(f.get(k) ?? "") || null
            : k === "countryCode"
              ? String(f.get(k) ?? "").toUpperCase()
              : String(f.get(k) ?? ""),
        ]),
      );
      const saved = await api<Partner>("/partners/profile", {
        method: "PATCH",
        body: JSON.stringify({ ...fields, version: r.data.version }),
      });
      const logo = f.get("logo");
      if (logo instanceof File && logo.size) {
        try {
          await api("/partners/profile/logo", {
            method: "PUT",
            body: logo,
            headers: {
              "Content-Type": logo.type,
              "X-Shop-Version": String(saved.version),
            },
          });
        } catch (e) {
          setNotice(
            `Profil enregistré. Le logo doit être repris : ${(e as Error).message}`,
          );
          setEdit(false);
          r.reload();
          return;
        }
      }
      setNotice("Profil de la boutique enregistré.");
      setEdit(false);
      r.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="ws-page-heading">
        <div>
          <span className="eyebrow">BOUTIQUE PARTENAIRE</span>
          <h1>Mon profil commercial</h1>
          <p>Une seule identité, partagée avec vos partenaires autorisés.</p>
        </div>
        {can && !edit && (
          <Button onClick={() => setEdit(true)}>Modifier le profil</Button>
        )}
      </div>
      <Feedback error={error} notice={notice} />
      <Resource {...r}>
        {r.data && (
          <Card>
            {edit ? (
              <form className="admin-form" onSubmit={submit}>
                <div className="ds-form-grid">
                  <Field
                    name="name"
                    label="Nom commercial"
                    defaultValue={r.data.name}
                    required
                    maxLength={160}
                  />
                  <Field
                    name="legalName"
                    label="Raison sociale"
                    defaultValue={r.data.legalName ?? ""}
                    maxLength={160}
                  />
                  <Field
                    name="email"
                    label="E-mail professionnel"
                    defaultValue={r.data.email}
                    type="email"
                    required
                  />
                  <Field
                    name="phone"
                    label="Téléphone professionnel"
                    defaultValue={r.data.phone}
                    required
                    maxLength={32}
                  />
                  <Field
                    name="countryCode"
                    label="Pays — code à deux lettres"
                    defaultValue={r.data.countryCode}
                    required
                    minLength={2}
                    maxLength={2}
                  />
                  <Field
                    name="city"
                    label="Ville"
                    defaultValue={r.data.city}
                    required
                    maxLength={120}
                  />
                  <Field
                    name="district"
                    label="Quartier"
                    defaultValue={r.data.district ?? ""}
                    maxLength={160}
                  />
                  <Field
                    name="address"
                    label="Adresse"
                    defaultValue={r.data.address}
                    required
                    maxLength={500}
                  />
                </div>
                <Textarea
                  name="description"
                  label="Présentation"
                  defaultValue={r.data.description ?? ""}
                  maxLength={2000}
                />
                <Field
                  label="Logo facultatif"
                  name="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hint="PNG, JPEG ou WebP, 2 Mo maximum."
                />
                <div className="ds-actions">
                  <Button busy={busy} type="submit">
                    Enregistrer
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => setEdit(false)}
                  >
                    Annuler
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <Identity p={r.data} />
                <dl className="partner-details">
                  {[
                    ["Référence", r.data.reference],
                    ["Raison sociale", r.data.legalName],
                    ["Téléphone", r.data.phone],
                    ["E-mail", r.data.email],
                    [
                      "Adresse",
                      [
                        r.data.address,
                        r.data.district,
                        r.data.city,
                        r.data.countryCode,
                      ]
                        .filter(Boolean)
                        .join(", "),
                    ],
                    ["Présentation", r.data.description],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
                <Status value={r.data.status} />
              </>
            )}
          </Card>
        )}
      </Resource>
    </>
  );
}

function CollaborationList({
  context,
  incoming = false,
}: {
  context: Workspace;
  incoming?: boolean;
}) {
  const shop = context.scope === "SHOP",
    base = `/portail/${context.portal}`,
    [q, setQ] = useState(""),
    [status, setStatus] = useState(incoming ? "PENDING" : ""),
    [direction, setDirection] = useState(incoming ? "received" : ""),
    [notice, setNotice] = useState(""),
    [page, setPage] = useState(1),
    [request, setRequest] = useState(false);
  const path = shop
    ? "/partners/collaborations"
    : incoming
      ? "/company/partner-requests"
      : "/company/partners";
  const r = useResource<Page<Collaboration>>(
    `${path}?q=${encodeURIComponent(q)}${status ? `&status=${status}` : ""}${direction ? `&direction=${direction}` : ""}&page=${page}`,
  );
  const can =
    context.permissions.includes(
      shop ? "shop.collaborations.manage" : "partners.manage",
    ) &&
    (shop || context.subscriptionAccess?.valid !== false);
  return (
    <>
      <div className="ws-page-heading">
        <div>
          <span className="eyebrow">
            {shop ? "MES TRANSPORTEURS" : "RÉSEAU PARTENAIRE"}
          </span>
          <h1>
            {incoming
              ? "Demandes de collaboration"
              : shop
                ? "Entreprises partenaires"
                : "Boutiques partenaires"}
          </h1>
          <p>
            {shop
              ? "Gérez chaque relation indépendamment et choisissez votre transporteur."
              : "Retrouvez les boutiques et demandes de votre entreprise."}
          </p>
        </div>
        {can && (
          <Button onClick={() => setRequest(!request)}>
            {shop ? "Demander une collaboration" : "Inviter une boutique"}
          </Button>
        )}
      </div>
      {shop && <CarrierPicker context={context} />}
      <Feedback notice={notice} />
      {request && (
        <RequestForm
          shop={shop}
          selectAgencies={
            !shop && context.permissions.includes("agencies.read")
          }
          done={() => {
            setRequest(false);
            setNotice(
              "Demande enregistrée. Consultez son statut dans la liste et le suivi des invitations.",
            );
            r.reload();
          }}
        />
      )}
      <div className="admin-filters">
        <Field
          label="Rechercher un partenaire"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label="Statut"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tous les statuts</option>
          {["PENDING", "ACTIVE", "REJECTED", "SUSPENDED", "ENDED"].map((s) => (
            <option key={s} value={s}>
              {statuses[s]}
            </option>
          ))}
        </Select>
        {shop && (
          <Select
            label="Sens de la demande"
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Toutes les demandes</option>
            <option value="received">Invitations reçues</option>
            <option value="sent">Demandes envoyées</option>
          </Select>
        )}
      </div>
      <Resource {...r}>
        {r.data &&
          (r.data.items.length ? (
            <div className="partner-grid">
              {r.data.items.map((c) => {
                const p = shop ? c.company : c.shop;
                return (
                  <Card key={c.id}>
                    <Identity p={p} />
                    <div className="partner-card-meta">
                      <Status value={c.status} />
                      <small>
                        {c.origin === "SHOP"
                          ? "Demande de la boutique"
                          : "Invitation de l’entreprise"}
                      </small>
                    </div>
                    <p>
                      {p.city} · {p.phone}
                    </p>
                    <Link
                      className="ds-button ds-secondary"
                      to={`${base}/${shop ? "transporteurs" : "partenaires"}/${c.id}`}
                    >
                      Consulter <ArrowUpRight size={15} />
                    </Link>
                  </Card>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Aucune collaboration dans cette sélection."
              description="Vos demandes et partenaires apparaîtront ici dès leur enregistrement."
            />
          ))}
        {r.data && (
          <Pager
            page={page}
            total={r.data.total}
            size={r.data.size}
            change={setPage}
          />
        )}
      </Resource>
    </>
  );
}

function PartnerAgencySelector({
  selected,
  change,
}: {
  selected: string[];
  change: (ids: string[]) => void;
}) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    r = useResource<Page<{ id: string; name: string }>>(
      `/company/agencies?status=ACTIVE&q=${encodeURIComponent(q)}&page=${page}`,
    );
  return (
    <fieldset className="partner-agency-selector">
      <legend>Agences accessibles à la boutique</legend>
      <p className="partner-help">
        Sélection facultative. Seules les agences sélectionnées seront affichées
        à la boutique.
      </p>
      <Field
        label="Rechercher une agence"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      <p>{selected.length} agence(s) sélectionnée(s)</p>
      <Resource {...r}>
        {r.data && (
          <>
            <div className="partner-checkboxes">
              {r.data.items.map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(a.id)}
                    onChange={(e) =>
                      change(
                        e.target.checked
                          ? [...selected, a.id]
                          : selected.filter((id) => id !== a.id),
                      )
                    }
                  />
                  {a.name}
                </label>
              ))}
            </div>
            <Pager
              page={page}
              total={r.data.total}
              size={r.data.size}
              change={setPage}
            />
          </>
        )}
      </Resource>
    </fieldset>
  );
}
function RequestForm({
  shop,
  done,
  selectAgencies = false,
}: {
  shop: boolean;
  done: () => void;
  selectAgencies?: boolean;
}) {
  const [mode, setMode] = useState("existing"),
    [reference, setReference] = useState(""),
    [found, setFound] = useState<Partner | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [agencyIds, setAgencyIds] = useState<string[]>([]);
  async function lookup() {
    setBusy(true);
    setError("");
    setFound(null);
    try {
      const v = await api<{ items: Partner[] }>(
        `${shop ? "/partners/directory/companies" : "/company/partner-directory"}?reference=${encodeURIComponent(reference)}`,
      );
      setFound(v.items[0] ?? null);
      if (!v.items.length)
        setError("Aucun partenaire ne correspond à cette référence.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const body = shop
        ? { companyReference: reference }
        : mode === "existing"
          ? {
              shopReference: reference,
              ...(agencyIds.length ? { agencyIds } : {}),
            }
          : {
              email: String(f.get("email")),
              shopName: String(f.get("shopName")),
              ...(agencyIds.length ? { agencyIds } : {}),
            };
      const result = await api<{
        message?: string;
        invitationDelivery?: string;
        deliveryStatus?: string;
      }>(shop ? "/partners/collaborations" : "/company/partner-invitations", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setNotice(
        result.invitationDelivery === "FAILED" ||
          result.deliveryStatus === "FAILED"
          ? "Invitation enregistrée. L’envoi a échoué; vous pourrez réessayer depuis les invitations."
          : (result.message ??
              "Demande enregistrée. L’autre partie doit maintenant donner son accord."),
      );
      if (
        result.invitationDelivery !== "FAILED" &&
        result.deliveryStatus !== "FAILED"
      )
        done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={shop ? "Nouvelle demande" : "Inviter une boutique"}>
      <form onSubmit={submit} className="admin-form">
        {!shop && (
          <Select
            label="La boutique possède-t-elle une référence DND ?"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setFound(null);
            }}
          >
            <option value="existing">
              Oui, demander à une boutique existante
            </option>
            <option value="new">Préparer son inscription par e-mail</option>
          </Select>
        )}
        {shop || mode === "existing" ? (
          <>
            <div className="admin-toolbar">
              <Field
                label={
                  shop
                    ? "Référence de l’entreprise"
                    : "Référence de la boutique"
                }
                value={reference}
                required
                maxLength={50}
                onChange={(e) => {
                  setReference(e.target.value);
                  setFound(null);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                busy={busy}
                disabled={!reference}
                onClick={() => void lookup()}
              >
                Vérifier la référence
              </Button>
            </div>
            {found && (
              <div className="partner-lookup">
                <strong>{found.tradeName ?? found.name}</strong>
                <span>
                  {found.reference} · {found.city}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="ds-form-grid">
            <Field
              name="shopName"
              label="Nom de la boutique"
              required
              maxLength={160}
            />
            <Field
              name="email"
              label="E-mail du responsable"
              type="email"
              required
              maxLength={254}
            />
          </div>
        )}
        {!shop && selectAgencies && (
          <PartnerAgencySelector selected={agencyIds} change={setAgencyIds} />
        )}
        <p className="partner-help">
          {shop
            ? "La demande reste en attente jusqu’à l’acceptation de l’entreprise."
            : "Cette invitation ne crée aucun accès sans l’accord d’un responsable de la boutique."}
        </p>
        <Feedback error={error} notice={notice} />
        <Button type="submit" busy={busy}>
          Envoyer {shop ? "la demande" : "l’invitation"}
        </Button>
      </form>
    </Card>
  );
}

function CollaborationAgencies({
  collaboration,
  done,
}: {
  collaboration: Collaboration;
  done: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(
      collaboration.allowedAgencyIds ?? [],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/company/partners/${collaboration.id}/agencies`, {
        method: "PATCH",
        body: JSON.stringify({
          version: collaboration.version,
          agencyIds: selected,
        }),
      });
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Agences partagées avec la boutique">
      <form className="admin-form" onSubmit={submit}>
        <PartnerAgencySelector selected={selected} change={setSelected} />
        <p className="partner-help">
          Les nouveaux dépôts et transferts exigent une collaboration active et
          des agences explicitement partagées. Les historiques des anciennes
          agences sont conservés.
        </p>
        <Feedback error={error} />
        <Button type="submit" busy={busy}>
          Enregistrer les agences autorisées
        </Button>
      </form>
    </Card>
  );
}
function CollaborationDetail({
  id,
  context,
}: {
  id: string;
  context: Workspace;
}) {
  const auth = useAuth(),
    shop = context.scope === "SHOP",
    r = useResource<Collaboration>(
      shop ? `/partners/collaborations/${id}` : `/company/partners/${id}`,
    ),
    [action, setAction] = useState<AdminAction | null>(null),
    [notice, setNotice] = useState("");
  const c = r.data,
    can =
      context.permissions.includes(
        shop ? "shop.collaborations.manage" : "partners.manage",
      ) &&
      (shop || context.subscriptionAccess?.valid !== false);
  function act(key: string) {
    if (!c) return;
    const verbs: Record<string, string> = {
      accept: "Accepter cette collaboration",
      reject: "Refuser cette collaboration",
      suspend: "Suspendre cette collaboration",
      terminate: "Terminer cette collaboration",
      request: "Envoyer une nouvelle demande",
    };
    setAction({
      title: verbs[key],
      description:
        key === "request"
          ? "Une nouvelle autorisation de l’autre partie sera nécessaire. Aucun accès n’est rétabli immédiatement."
          : key === "terminate"
            ? "Les historiques sont conservés. Les nouvelles opérations seront bloquées pour cette collaboration."
            : "La décision sera enregistrée et communiquée à l’autre partie.",
      reason: ["reject", "suspend", "terminate"].includes(key),
      submit: (reason) =>
        api(
          `${shop ? "/partners/collaborations" : "/company/partners"}/${id}/${key}`,
          {
            method: "POST",
            body: JSON.stringify({
              version: c.version,
              ...(reason ? { reason } : {}),
            }),
          },
        ),
    });
  }
  return (
    <>
      <Link
        to={`/portail/${context.portal}/${shop ? "transporteurs" : "partenaires"}`}
        className="partner-back"
      >
        ← Tous les partenaires
      </Link>
      <h1>Détails de la collaboration</h1>
      <Feedback notice={notice} />
      <Resource {...r}>
        {c && (
          <>
            <Card>
              <Identity p={shop ? c.company : c.shop} />
              <div className="partner-card-meta">
                <Status value={c.status} />
                <span>
                  {c.origin === "SHOP"
                    ? "Initiée par la boutique"
                    : "Initiée par l’entreprise"}
                </span>
              </div>
              <dl className="partner-details">
                {[
                  ["E-mail", (shop ? c.company : c.shop).email],
                  ["Téléphone", (shop ? c.company : c.shop).phone],
                  ["Adresse", (shop ? c.company : c.shop).address],
                  ["Demande", date(c.requestedAt)],
                  ["Acceptation", date(c.acceptedAt)],
                  ["Suspension", date(c.suspendedAt)],
                  ["Fin", date(c.endedAt)],
                  ["Motif", c.reason],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v || "—"}</dd>
                  </div>
                ))}
              </dl>
              {can && (
                <div className="ds-actions">
                  {c.status === "PENDING" &&
                    c.origin !== (shop ? "SHOP" : "COMPANY") && (
                      <>
                        <Button onClick={() => act("accept")}>Accepter</Button>
                        <Button variant="danger" onClick={() => act("reject")}>
                          Refuser
                        </Button>
                      </>
                    )}
                  {!shop && c.status === "ACTIVE" && (
                    <Button variant="secondary" onClick={() => act("suspend")}>
                      Suspendre
                    </Button>
                  )}
                  {["ACTIVE", "SUSPENDED"].includes(c.status) && (
                    <Button variant="danger" onClick={() => act("terminate")}>
                      Terminer la collaboration
                    </Button>
                  )}
                  {["REJECTED", "ENDED", "SUSPENDED"].includes(c.status) && (
                    <Button variant="secondary" onClick={() => act("request")}>
                      Demander une nouvelle autorisation
                    </Button>
                  )}
                </div>
              )}
            </Card>
            {!shop &&
              can &&
              context.permissions.includes("agencies.read") &&
              ["PENDING", "ACTIVE"].includes(c.status) && (
                <CollaborationAgencies
                  key={c.version}
                  collaboration={c}
                  done={() => {
                    setNotice("Agences de collaboration enregistrées.");
                    r.reload();
                  }}
                />
              )}
            {c.openOperations &&
              Object.values(c.openOperations).some((n) => n > 0) && (
                <Card title="Opérations à suivre">
                  <p>
                    Cette collaboration comporte encore{" "}
                    {c.openOperations.stockLocations} emplacement(s) de stock,{" "}
                    {c.openOperations.openOrders} commande(s),{" "}
                    {c.openOperations.openDeliveries} livraison(s) et{" "}
                    {c.openOperations.openTransfers} transfert(s) ouverts. Les
                    historiques seront conservés; leur règlement reste à
                    organiser avec le partenaire.
                  </p>
                </Card>
              )}
            {shop && (
              <Card title="Agences accessibles">
                {c.agencies?.length ? (
                  <ul className="partner-agencies">
                    {c.agencies.map((a) => (
                      <li key={a.id}>
                        <Building2 size={18} />
                        <span>
                          <strong>{a.name}</strong>
                          <small>{a.city}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    Aucune agence accessible définie pour cette collaboration.
                  </p>
                )}
              </Card>
            )}
            <Card title="Historique de cette collaboration">
              <HistoryList items={c.history ?? []} />
            </Card>
          </>
        )}
      </Resource>
      {action && (
        <ConfirmAction
          action={action}
          close={() => setAction(null)}
          done={(m) => {
            setNotice(m);
            r.reload();
            void auth.reload();
          }}
        />
      )}
    </>
  );
}

function HistoryList({ items }: { items: History[] }) {
  return items.length ? (
    <DataTable
      caption="Événements de collaboration"
      columns={["Action", "Auteur", "Date", "Motif"]}
      rows={items.map((h) => [
        partnerActionLabels[h.action] ??
          actions[h.action] ??
          h.action
            .replace(/^PARTNER_|^COLLABORATION_/, "")
            .replaceAll("_", " "),
        h.actor?.fullName ?? "—",
        date(h.createdAt),
        h.metadata?.reason ?? "—",
      ])}
    />
  ) : (
    <EmptyState
      title="Aucun événement à afficher."
      description="Les modifications et décisions seront conservées dans cet historique."
    />
  );
}
function ShopHistory() {
  const [page, setPage] = useState(1),
    r = useResource<Page<History>>(`/partners/history?page=${page}`);
  return (
    <>
      <h1>Historique de la boutique</h1>
      <Resource {...r}>
        {r.data && (
          <>
            <HistoryList items={r.data.items} />
            <Pager
              page={page}
              total={r.data.total}
              size={r.data.size}
              change={setPage}
            />
          </>
        )}
      </Resource>
    </>
  );
}

function ShopUsers({ context }: { context: Workspace }) {
  const [page, setPage] = useState(1),
    [q, setQ] = useState("");
  const r = useResource<Page<Member>>(
      `/partners/users?page=${page}&q=${encodeURIComponent(q)}`,
    ),
    [invite, setInvite] = useState(false),
    [action, setAction] = useState<AdminAction | null>(null),
    [editing, setEditing] = useState<Member | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const can = context.permissions.includes("shop.users.manage");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (editing)
        await api(`/partners/users/${editing.userId}`, {
          method: "PATCH",
          body: JSON.stringify({
            version: editing.version,
            role: String(f.get("role")),
            active: f.get("active") === "true",
          }),
        });
      else {
        const result = await api<{
          invitationDelivery?: string;
          deliveryStatus?: string;
        }>("/partners/users/invite", {
          method: "POST",
          body: JSON.stringify({
            email: String(f.get("email")),
            fullName: String(f.get("fullName")),
            role: String(f.get("role")),
          }),
        });
        if (
          result.invitationDelivery === "FAILED" ||
          result.deliveryStatus === "FAILED"
        )
          setNotice(
            "Invitation conservée. L’envoi a échoué; utilisez le renvoi depuis les invitations.",
          );
      }
      setEditing(null);
      setInvite(false);
      r.reload();
      setNotice((v) => v || "Modification enregistrée.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="ws-page-heading">
        <div>
          <h1>Utilisateurs de la boutique</h1>
          <p>
            Les accès sont propres à cette boutique. Les comptes existants sont
            conservés.
          </p>
        </div>
        {can && (
          <Button
            onClick={() => {
              setInvite(!invite);
              setEditing(null);
            }}
          >
            Inviter un utilisateur
          </Button>
        )}
      </div>
      <Feedback error={error} notice={notice} />
      <Field
        label="Rechercher un utilisateur"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      {(invite || editing) && (
        <Card
          title={
            editing
              ? `Accès de ${editing.user.fullName}`
              : "Nouvelle invitation"
          }
        >
          <form className="admin-form" onSubmit={submit}>
            {!editing && (
              <div className="ds-form-grid">
                <Field
                  name="fullName"
                  label="Nom complet"
                  required
                  minLength={2}
                  maxLength={160}
                />
                <Field
                  name="email"
                  label="Adresse e-mail"
                  type="email"
                  required
                  maxLength={254}
                />
              </div>
            )}
            <Select
              name="role"
              label="Rôle dans la boutique"
              defaultValue={editing?.role ?? "shop_employee"}
            >
              {Object.entries(roles).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            {editing && (
              <Select
                name="active"
                label="État de l’affiliation"
                defaultValue={String(editing.active)}
              >
                <option value="true">Active</option>
                <option value="false">Suspendue</option>
              </Select>
            )}
            <p className="partner-help">
              Le propriétaire gère les utilisateurs. Un employé ne reçoit pas
              automatiquement les droits de collaboration.
            </p>
            <div className="ds-actions">
              <Button type="submit" busy={busy}>
                {editing ? "Enregistrer les accès" : "Envoyer l’invitation"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setInvite(false);
                  setEditing(null);
                }}
              >
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      )}
      <Resource {...r}>
        {r.data &&
          (r.data.items.length ? (
            <DataTable
              caption="Affiliations de la boutique"
              columns={["Utilisateur", "Rôle", "État", "Actions"]}
              rows={r.data.items.map((m) => [
                <div className="admin-company-name">
                  {m.user.fullName}
                  <small>{m.user.email}</small>
                </div>,
                roles[m.role] ?? m.role,
                <Badge tone={m.active ? "success" : "neutral"}>
                  {m.active ? "Active" : "Inactive"}
                </Badge>,
                can ? (
                  <div className="ds-actions">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditing(m);
                        setInvite(false);
                      }}
                    >
                      Modifier
                    </Button>
                    {m.active && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setAction({
                            title: "Retirer cette affiliation ?",
                            description:
                              "Le compte et les accès à ses autres boutiques sont conservés. Le dernier propriétaire actif est protégé.",
                            reason: true,
                            submit: (reason) =>
                              api(`/partners/users/${m.userId}`, {
                                method: "DELETE",
                                body: JSON.stringify({
                                  version: m.version,
                                  reason,
                                }),
                              }),
                          })
                        }
                      >
                        Retirer
                      </Button>
                    )}
                  </div>
                ) : (
                  "—"
                ),
              ])}
            />
          ) : (
            <EmptyState title="Aucun utilisateur à afficher." />
          ))}
      </Resource>
      {r.data && (
        <Pager
          page={page}
          total={r.data.total}
          size={r.data.size}
          change={setPage}
        />
      )}
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
    </>
  );
}

function SentCollaborationRequests({ context }: { context: Workspace }) {
  const [page, setPage] = useState(1),
    r = useResource<Page<Collaboration>>(
      `/company/partners?direction=sent&status=PENDING&page=${page}`,
    );
  return (
    <Card title="Invitations aux boutiques déjà inscrites">
      <Resource {...r}>
        {r.data && (
          <>
            {r.data.items.length ? (
              <DataTable
                caption="Collaborations en attente d’accord"
                columns={["Boutique", "Date d’envoi", "Statut", ""]}
                rows={r.data.items.map((c) => [
                  c.shop.name,
                  date(c.requestedAt),
                  <Status value={c.status} />,
                  <Link to={`/portail/${context.portal}/partenaires/${c.id}`}>
                    Consulter
                  </Link>,
                ])}
              />
            ) : (
              <EmptyState
                title="Aucune invitation de collaboration en attente."
                description="Les demandes aux boutiques existantes apparaîtront ici."
              />
            )}
            <Pager
              page={page}
              total={r.data.total}
              size={r.data.size}
              change={setPage}
            />
          </>
        )}
      </Resource>
    </Card>
  );
}
function Invitations({ context }: { context: Workspace }) {
  const shop = context.scope === "SHOP",
    [page, setPage] = useState(1),
    [action, setAction] = useState<AdminAction | null>(null),
    [notice, setNotice] = useState("");
  const r = useResource<Page<Invitation>>(
      `${shop ? "/partners/invitations" : "/company/partner-invitations"}?page=${page}`,
    ),
    can =
      context.permissions.includes(
        shop ? "shop.users.manage" : "partners.manage",
      ) &&
      (shop || context.subscriptionAccess?.valid !== false);
  return (
    <>
      <h1>
        {shop ? "Invitations d’utilisateurs" : "Invitations de boutiques"}
      </h1>
      <p>Suivez les invitations envoyées et les demandes d’inscription.</p>
      <Feedback notice={notice} />
      {!shop && can && (
        <RequestForm
          shop={false}
          done={r.reload}
          selectAgencies={context.permissions.includes("agencies.read")}
        />
      )}
      {!shop && <SentCollaborationRequests context={context} />}
      <Resource {...r}>
        {r.data && (
          <>
            {r.data.items.length ? (
              <DataTable
                caption="Invitations"
                columns={[
                  "Destinataire",
                  "Rôle / boutique",
                  "État",
                  "Expiration",
                  "Actions",
                ]}
                rows={r.data.items.map((i) => [
                  i.email,
                  roles[i.role ?? ""] ??
                    i.shopName ??
                    i.name ??
                    i.fullName ??
                    "—",
                  <>
                    <Status value={i.status} />
                    {i.deliveryStatus && (
                      <small>
                        {statuses[i.deliveryStatus] ?? i.deliveryStatus}
                      </small>
                    )}
                  </>,
                  date(i.expiresAt),
                  can && ["PENDING", "EXPIRED"].includes(i.status) ? (
                    <div className="ds-actions">
                      {["resend", "revoke"].map((a) => (
                        <Button
                          variant="ghost"
                          key={a}
                          onClick={() =>
                            setAction({
                              title:
                                a === "resend"
                                  ? "Renvoyer cette invitation ?"
                                  : "Révoquer cette invitation ?",
                              description:
                                a === "resend"
                                  ? "Le lien précédent sera remplacé par un nouveau lien temporaire."
                                  : "Le lien ne permettra plus d’accepter cette affiliation.",
                              submit: () =>
                                invitationAction(
                                  `${shop ? "/partners/invitations" : "/company/partner-invitations"}/${i.id}/${a}`,
                                  i.version ? { version: i.version } : {},
                                ),
                            })
                          }
                        >
                          {a === "resend" ? "Renvoyer" : "Révoquer"}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    "—"
                  ),
                ])}
              />
            ) : (
              <EmptyState
                title="Aucune invitation envoyée."
                description="Les prochaines invitations apparaîtront ici."
              />
            )}
            <Pager
              page={page}
              total={r.data.total}
              size={r.data.size}
              change={setPage}
            />
          </>
        )}
      </Resource>
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
    </>
  );
}

function ShopHome({ context }: { context: Workspace }) {
  const r = useResource<Page<Collaboration>>("/partners/collaborations?size=5"),
    base = "/portail/boutique";
  return (
    <>
      <div className="ws-page-heading">
        <div>
          <span className="eyebrow">ESPACE BOUTIQUE</span>
          <h1>{context.shopName ?? "Votre boutique"}</h1>
          <p>
            Vos informations, votre équipe et vos partenaires, au même endroit.
          </p>
        </div>
        <Link className="ds-button ds-secondary" to={`${base}/profil-boutique`}>
          Mon profil commercial
        </Link>
      </div>
      <CarrierPicker context={context} />
      <Card
        title="Vos collaborations"
        action={<Link to={`${base}/transporteurs`}>Tout consulter</Link>}
      >
        <Resource {...r}>
          {r.data &&
            (r.data.items.length ? (
              <ul className="partner-home-list">
                {r.data.items.map((c) => (
                  <li key={c.id}>
                    <div>
                      <strong>{c.company.tradeName ?? c.company.name}</strong>
                      <small>{c.company.city}</small>
                    </div>
                    <Status value={c.status} />
                    <Link to={`${base}/transporteurs/${c.id}`}>Consulter</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="Votre réseau commence ici."
                description="Demandez une collaboration à une entreprise ou acceptez une invitation reçue."
                action={
                  <Link
                    className="ds-button ds-primary"
                    to={`${base}/transporteurs`}
                  >
                    Choisir un partenaire
                  </Link>
                }
              />
            ))}
        </Resource>
      </Card>
      <Card title="La suite de votre espace">
        <p>
          Votre catalogue et vos marchandises sont accessibles depuis le menu.
          Créez aussi vos commandes ponctuelles ou depuis stock et consultez
          leur état depuis Mes commandes.
        </p>
      </Card>
    </>
  );
}

function PartnerNotifications({ context }: { context: Workspace }) {
  const [page, setPage] = useState(1),
    r = useResource<
      Page<{
        id: string;
        sourceEvent: string;
        payload: { shopName?: string; companyName?: string; event?: string };
        createdAt: string;
      }>
    >(
      `${context.scope === "SHOP" ? "/partners/notifications" : "/company/partner-notifications"}?page=${page}`,
    );
  return (
    <>
      <div className="ws-page-heading">
        <div>
          <h1>Notifications partenaires</h1>
          <p>Les invitations et décisions concernant vos collaborations.</p>
        </div>
        <Button variant="secondary" onClick={r.reload}>
          Actualiser
        </Button>
      </div>
      <Resource {...r}>
        {r.data && (
          <>
            {r.data.items.length ? (
              <div className="partner-notification-list">
                {r.data.items.map((n) => {
                  const event = n.payload?.event ?? n.sourceEvent;
                  return (
                    <Card key={n.id}>
                      <Badge>
                        {partnerActionLabels[`PARTNER_${event}`] ??
                          partnerActionLabels[event] ??
                          event.replace(/^PARTNER_/, "").replaceAll("_", " ")}
                      </Badge>
                      <h2>
                        {context.scope === "SHOP"
                          ? n.payload?.companyName
                          : n.payload?.shopName}
                      </h2>
                      <p>{date(n.createdAt)}</p>
                      <Link
                        to={`/portail/${context.portal}/${context.scope === "SHOP" ? "transporteurs" : "partenaires"}`}
                      >
                        Consulter mes collaborations
                      </Link>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="Aucune notification pour le moment."
                description="Les prochains changements de collaboration apparaîtront ici."
              />
            )}
            <Pager
              page={page}
              total={r.data.total}
              size={r.data.size}
              change={setPage}
            />
          </>
        )}
      </Resource>
    </>
  );
}

export function PartnersWorkspace({
  context,
  moduleId,
}: {
  context: Workspace;
  moduleId: string;
}) {
  const { entityId } = useParams();
  if (
    ["notifications-boutique", "notifications-partenaires"].includes(moduleId)
  )
    return <PartnerNotifications context={context} />;
  if (context.scope === "SHOP") {
    if (moduleId === "accueil") return <ShopHome context={context} />;
    if (["profil-boutique", "parametres"].includes(moduleId))
      return <ShopProfile context={context} />;
    if (moduleId === "utilisateurs-boutique")
      return <ShopUsers context={context} />;
    if (moduleId === "invitations-boutique")
      return <Invitations context={context} />;
    if (moduleId === "historique-boutique") return <ShopHistory />;
    return entityId ? (
      <CollaborationDetail id={entityId} context={context} />
    ) : (
      <CollaborationList
        context={context}
        incoming={moduleId === "demandes-collaboration"}
      />
    );
  }
  if (moduleId === "invitations-partenaires")
    return <Invitations context={context} />;
  return entityId ? (
    <CollaborationDetail id={entityId} context={context} />
  ) : (
    <CollaborationList
      context={context}
      incoming={moduleId === "demandes-partenaires"}
    />
  );
}
