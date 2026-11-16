import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Workspace } from "../auth/types";
import {
  Button,
  Card,
  Badge,
  EmptyState,
  ErrorState,
  Field,
  Select,
  Skeleton,
} from "../design/ui";
import { useFinanceData } from "./useFinanceData";
import { FinanceActionForm } from "./FinanceActionForm";
import {
  financialMoney,
  financeStates,
  financeStatusLabel,
  paymentMethods,
  financeEvents,
  correctionKinds,
  correctionSummary,
  type FinancePage,
  type FinanceObligation,
  type FinanceEntry,
  type FinanceEntryDetail,
  type FinanceRemittance,
  type FinanceDiscrepancy,
  type FinanceCorrection,
  type FinanceOverview,
  type FinanceOptions,
  type FinanceEvent,
  type FinanceNotice,
  type FinanceFormTarget,
} from "../../../shared/finance";
import "./finance.css";
export function FinanceTimeline({ events }: { events: FinanceEvent[] }) {
  return (
    <ol className="finance-events">
      {events.map((e) => (
        <li key={e.id}>
          <strong>{financeEvents[e.action] ?? e.action}</strong>
          <p>
            {e.actorName ? `${e.actorName} · ` : ""}
            {new Date(e.createdAt).toLocaleString("fr-FR")} ·{" "}
            {financialMoney(e.amount, e.currency)}
          </p>
          {e.reason && <p>{e.reason}</p>}
          {e.status && (
            <Badge>
              {financeStatusLabel(e.status, e.action.startsWith("CORRECTION_"))}
            </Badge>
          )}
        </li>
      ))}
    </ol>
  );
}
export function FinanceWorkspace({
  context,
  moduleId,
}: {
  context: Workspace;
  moduleId: string;
}) {
  const [params] = useSearchParams(),
    [mode, setMode] = useState(
      moduleId === "remises"
        ? "remittances"
        : moduleId === "ecarts-financiers"
          ? "discrepancies"
          : moduleId === "corrections-financieres"
            ? "corrections"
            : moduleId === "historique-financier"
              ? "history"
              : moduleId === "soldes-livreurs"
                ? "balances"
                : "obligations",
    ),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [detail, setDetail] = useState<{
      kind: "collection" | "remittance";
      id: string;
    }>(),
    [form, setForm] = useState<FinanceFormTarget>();
  const query = new URLSearchParams({
    page: String(page),
    q,
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    ...(params.get("orderId") ? { orderId: params.get("orderId")! } : {}),
  }).toString();
  const overview = useFinanceData<FinanceOverview>(
      `/financial-overview?${query}`,
    ),
    options = useFinanceData<FinanceOptions>("/financial-options"),
    obligations = useFinanceData<FinancePage<FinanceObligation>>(
      mode === "obligations" ? `/financial-obligations?${query}` : null,
    ),
    entries = useFinanceData<FinancePage<FinanceEntry>>(
      mode === "entries" ? `/collections?${query}` : null,
    ),
    remittances = useFinanceData<FinancePage<FinanceRemittance>>(
      mode === "remittances" ? `/cash-remittances?${query}` : null,
    ),
    discrepancies = useFinanceData<FinancePage<FinanceDiscrepancy>>(
      mode === "discrepancies" ? `/financial-discrepancies?${query}` : null,
    ),
    corrections = useFinanceData<FinancePage<FinanceCorrection>>(
      mode === "corrections" ? `/financial-corrections?${query}` : null,
    ),
    history = useFinanceData<FinancePage<FinanceEvent>>(
      mode === "history" ? `/financial-history?${query}` : null,
    ),
    notices = useFinanceData<FinanceNotice[]>(
      mode === "notices" ? "/financial-notifications" : null,
    ),
    remitSource = useFinanceData<FinancePage<FinanceEntry>>(
      form?.code === "REMIT" ? `/collections?size=50&page=${page}` : null,
    ),
    collection = useFinanceData<FinanceEntryDetail>(
      detail?.kind === "collection" ? `/collections/${detail.id}` : null,
    ),
    remittance = useFinanceData<FinanceRemittance>(
      detail?.kind === "remittance" ? `/cash-remittances/${detail.id}` : null,
    );
  const data = overview.data,
    permissions = data?.permissions ?? context.permissions,
    shop = data?.kind === "shop" || context.scope === "SHOP",
    driver = data?.kind === "driver",
    can = (p: string) => permissions.includes(p),
    active =
      mode === "obligations"
        ? obligations
        : mode === "entries"
          ? entries
          : mode === "remittances"
            ? remittances
            : mode === "discrepancies"
              ? discrepancies
              : mode === "corrections"
                ? corrections
                : history;
  const reload = () => {
    overview.reload();
    options.reload();
    obligations.reload();
    entries.reload();
    remittances.reload();
    discrepancies.reload();
    corrections.reload();
    history.reload();
    notices.reload();
    collection.reload();
    remittance.reload();
    remitSource.reload();
  };
  const switchMode = (value: string) => {
    setMode(value);
    setPage(1);
    setFilters({});
    setDetail(undefined);
  };
  const updateFilter = (key: string, value: string) => {
    setFilters((v) => ({ ...v, [key]: value }));
    setPage(1);
  };
  const openRemit = () => {
    setPage(1);
    setForm({
      code: "REMIT",
      agencies: options.data?.agencies,
      agencyId: context.agencyId,
      entries: [],
      currencies: data?.money
        .filter((m) => m.available && m.available !== "0.0000")
        .map((m) => m.currency),
    });
  };
  const title = shop
    ? "Suivi financier de vos commandes"
    : driver
      ? "Mes encaissements et remises"
      : "Encaissements et fonds des agences";
  const entry = collection.data?.entry,
    r = remittance.data;
  return (
    <div className="finance-stack">
      <div>
        <p className="ds-eyebrow">TRAÇABILITÉ DES PAIEMENTS EXTERNES</p>
        <h1>{title}</h1>
        <p>
          Les déclarations du livreur et les réceptions confirmées par l’agence
          sont affichées séparément. DND Delivery n’exécute aucun paiement.
        </p>
      </div>
      <div className="finance-row">
        <span>
          {overview.lastSync
            ? `Actualisé à ${new Date(overview.lastSync).toLocaleTimeString("fr-FR")}`
            : "Chargement des montants…"}{" "}
          · Actualisation toutes les 30 secondes sur cette page active.
        </span>
        <Button variant="secondary" onClick={reload}>
          Actualiser les finances
        </Button>
      </div>
      {overview.error && (
        <ErrorState message={overview.error} retry={overview.reload} />
      )}
      {!data && !overview.error && <Skeleton />}
      {data?.money.map((m) => (
        <Card key={m.currency}>
          <h2>{m.currency}</h2>
          <div className="finance-grid">
            {[
              ["Montant attendu", m.expected],
              ["Encaissements déclarés nets", m.net],
              ["Remboursements externes documentés", m.refunded],
              ["Reste auprès des destinataires", m.remaining],
              ...(!shop
                ? [
                    ["Encaissements valides avant remboursements", m.gross],
                    ["Confirmé reçu par les agences", m.confirmed],
                    ["Remboursé par les agences", m.agencyRefunded],
                    [
                      "Réceptions nettes après remboursements d’agence",
                      m.agencyRetained,
                    ],
                    ["Reste à remettre / justifier", m.liability],
                    ["Engagé dans des remises en attente", m.reserved],
                  ]
                : []),
            ].map(([label, value]) => (
              <div key={label}>
                <h3>{label}</h3>
                <span className="finance-amount">
                  {financialMoney(value, m.currency)}
                </span>
              </div>
            ))}
          </div>
          {!!m.unreconciled && (
            <p>
              Historique ancien à rapprocher : {m.unreconciled} déclaration(s),
              exclues des nouveaux soldes.
            </p>
          )}
        </Card>
      ))}
      {!shop && (
        <p>
          {data?.pendingRemittances ?? 0} remise(s) en attente de confirmation ·{" "}
          {data?.openDiscrepancies ?? 0} écart(s) ouvert(s).
        </p>
      )}
      <div className="ds-actions">
        <Button
          variant={mode === "obligations" ? "primary" : "secondary"}
          onClick={() => switchMode("obligations")}
        >
          Montants attendus
        </Button>
        <Button
          variant={mode === "entries" ? "primary" : "secondary"}
          onClick={() => switchMode("entries")}
        >
          Déclarations d’encaissement
        </Button>
        {!shop && (
          <>
            <Button
              variant={mode === "remittances" ? "primary" : "secondary"}
              onClick={() => switchMode("remittances")}
            >
              Remises de fonds
            </Button>
            <Button
              variant={mode === "balances" ? "primary" : "secondary"}
              onClick={() => switchMode("balances")}
            >
              Soldes par livreur et agence
            </Button>
            <Button
              variant={mode === "discrepancies" ? "primary" : "secondary"}
              onClick={() => switchMode("discrepancies")}
            >
              Écarts
            </Button>
            <Button
              variant={mode === "corrections" ? "primary" : "secondary"}
              onClick={() => switchMode("corrections")}
            >
              Corrections et régularisations
            </Button>
            <Button
              variant={mode === "history" ? "primary" : "secondary"}
              onClick={() => switchMode("history")}
            >
              Historique financier
            </Button>
            <Button
              variant={mode === "notices" ? "primary" : "secondary"}
              onClick={() => switchMode("notices")}
            >
              Avis financiers
            </Button>
          </>
        )}
        {can("remittances.declare") && (
          <Button onClick={openRemit}>Déclarer une remise</Button>
        )}
      </div>
      {detail ? (
        <>
          <Button variant="secondary" onClick={() => setDetail(undefined)}>
            Retour à la liste financière
          </Button>
          {(collection.error || remittance.error) && (
            <ErrorState
              message={collection.error ?? remittance.error ?? ""}
              retry={reload}
            />
          )}
          {detail.kind === "collection" && entry && (
            <>
              <Card>
                <h2 className="finance-reference">
                  {entry.reference ?? entry.publicNumber}
                </h2>
                <p>
                  {entry.publicNumber} ·{" "}
                  {entry.courierName ?? entry.shopName ?? "Votre commande"}
                </p>
                <p>
                  Attendu lors de la déclaration :{" "}
                  {financialMoney(entry.expectedSnapshot, entry.currency)}
                </p>
                <p>
                  Déclaration d’origine :{" "}
                  {financialMoney(entry.declaredAmount ?? "0", entry.currency)}
                </p>
                <p>
                  Déclaré valide après corrections :{" "}
                  {financialMoney(entry.gross, entry.currency)} · Remboursé hors
                  plateforme : {financialMoney(entry.refunded, entry.currency)}
                </p>
                {!shop && (
                  <>
                    <p>
                      Confirmé reçu par l’agence :{" "}
                      {financialMoney(entry.confirmed, entry.currency)}
                    </p>
                    <p>
                      Remboursé par le livreur :{" "}
                      {financialMoney(entry.courierRefunded, entry.currency)} ·
                      par l’agence :{" "}
                      {financialMoney(entry.agencyRefunded, entry.currency)}
                    </p>
                    <p>
                      Réceptions nettes après remboursements de l’agence :{" "}
                      {financialMoney(entry.agencyRetained, entry.currency)}
                    </p>
                    <p>
                      À remettre / justifier :{" "}
                      <strong>
                        {financialMoney(entry.liability, entry.currency)}
                      </strong>{" "}
                      · Déjà engagé :{" "}
                      {financialMoney(entry.reserved, entry.currency)}
                    </p>
                    <p>
                      Moyen externe :{" "}
                      {paymentMethods.find((m) => m.value === entry.method)
                        ?.label ?? entry.method}{" "}
                      · {entry.notes}
                    </p>
                  </>
                )}
                {entry.blocked && (
                  <Badge>Régularisation en attente de décision</Badge>
                )}
                {entry.legacy && <Badge>Historique à rapprocher</Badge>}
                {!shop && !entry.legacy && (
                  <div className="ds-actions">
                    {(can("financial.corrections.request") ||
                      can("financial.corrections.self.request")) &&
                      !entry.blocked && (
                        <Button
                          onClick={() =>
                            setForm({
                              code: "CORRECT",
                              entry,
                              allowAgencyRefund: can(
                                "financial.corrections.request",
                              ),
                            })
                          }
                        >
                          Demander une régularisation
                        </Button>
                      )}
                    {can("financial.discrepancies.manage") && (
                      <Button
                        variant="secondary"
                        onClick={() => setForm({ code: "REPORT", entry })}
                      >
                        Signaler un écart
                      </Button>
                    )}
                  </div>
                )}
              </Card>
              {!shop &&
                entry.items?.map((i) => (
                  <Card key={i.id}>
                    <p className="finance-reference">{i.reference}</p>
                    <p>
                      Déclaré remis :{" "}
                      {financialMoney(i.declared, entry.currency)} · Réellement
                      confirmé : {financialMoney(i.confirmed, entry.currency)}
                    </p>
                    <Badge>{financeStates[i.status] ?? i.status}</Badge>
                  </Card>
                ))}
              <Card>
                <h2>Historique autorisé</h2>
                <FinanceTimeline events={collection.data?.events ?? []} />
              </Card>
            </>
          )}
          {detail.kind === "remittance" && r && (
            <>
              <Card>
                <h2 className="finance-reference">{r.reference}</h2>
                <p>
                  {r.courierName} ·{" "}
                  {new Date(r.declaredAt).toLocaleString("fr-FR")}
                </p>
                <Badge>{financeStates[r.status] ?? r.status}</Badge>
                <p>
                  Déclaré remis :{" "}
                  <strong>
                    {financialMoney(r.declaredAmount, r.currency)}
                  </strong>
                </p>
                <p>
                  Constat initial confirmé :{" "}
                  {financialMoney(r.confirmedAmount ?? undefined, r.currency)}
                </p>
                <p>
                  Reçu après régularisations :{" "}
                  {r.confirmedAt
                    ? financialMoney(r.effectiveConfirmedAmount, r.currency)
                    : "En attente de constat"}
                </p>
                <p>
                  Constaté par :{" "}
                  {r.confirmedByName ?? "En attente de réception"}
                </p>
                {r.decisionReason && <p>Décision : {r.decisionReason}</p>}
                {r.notes && <p>{r.notes}</p>}
                {r.canConfirm && (
                  <Button
                    onClick={() => setForm({ code: "DECIDE", remittance: r })}
                  >
                    Confirmer ou contester la réception
                  </Button>
                )}
                {can("financial.discrepancies.manage") && (
                  <Button
                    variant="secondary"
                    onClick={() => setForm({ code: "REPORT", remittance: r })}
                  >
                    Signaler un écart sur cette remise
                  </Button>
                )}
              </Card>
              {r.items?.map((i) => (
                <Card key={i.id}>
                  <strong className="finance-reference">
                    {i.reference ?? i.publicNumber}
                  </strong>
                  <p>
                    Déclaré remis :{" "}
                    {financialMoney(i.declaredAmount ?? undefined, r.currency)}{" "}
                    · Constat initial :{" "}
                    {financialMoney(i.confirmedAmount ?? undefined, r.currency)}
                  </p>
                  <p>
                    Reçu après régularisations approuvées :{" "}
                    {financialMoney(i.effectiveConfirmed, r.currency)}
                  </p>
                  {can("financial.corrections.request") &&
                    ["CONFIRM", "DISPUTE"].includes(r.decision ?? "") && (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setForm({
                            code: "RECEIPT",
                            remittance: r,
                            receiptItemId: i.id,
                          })
                        }
                      >
                        Demander une correction de cette réception
                      </Button>
                    )}
                </Card>
              ))}
              <Card>
                <h2>Décisions conservées</h2>
                <FinanceTimeline events={r.events ?? []} />
              </Card>
            </>
          )}
        </>
      ) : (
        <>
          <Card>
            <div className="finance-filter-grid">
              <Field
                label="Référence ou boutique"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
              <Field
                label="Devise"
                maxLength={3}
                value={filters.currency ?? ""}
                onChange={(e) =>
                  updateFilter("currency", e.target.value.toUpperCase())
                }
              />
              {!shop && options.data?.agencies.length !== 1 && (
                <Select
                  label="Agence financière"
                  value={filters.agencyId ?? ""}
                  onChange={(e) => updateFilter("agencyId", e.target.value)}
                >
                  <option value="">Toutes les agences autorisées</option>
                  {options.data?.agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              )}
              {shop && !context.companyId && (
                <Select
                  label="Agence de livraison"
                  value={filters.companyId ?? ""}
                  onChange={(e) => updateFilter("companyId", e.target.value)}
                >
                  <option value="">Toutes mes agences de livraison</option>
                  {options.data?.companies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              )}
              <Field
                label="Du"
                type="date"
                value={filters.from ?? ""}
                onChange={(e) => updateFilter("from", e.target.value)}
              />
              <Field
                label="Au"
                type="date"
                value={filters.to ?? ""}
                onChange={(e) => updateFilter("to", e.target.value)}
              />
              {[
                "obligations",
                "remittances",
                "discrepancies",
                "corrections",
              ].includes(mode) && (
                <Select
                  label="État financier"
                  value={filters.status ?? ""}
                  onChange={(e) => updateFilter("status", e.target.value)}
                >
                  <option value="">Tous les états</option>
                  {(mode === "obligations"
                    ? [
                        "NOT_REQUIRED",
                        "PENDING",
                        "PARTIAL",
                        "DECLARED_COMPLETE",
                        "NONE_RECEIVED",
                        "EXCESS",
                        "REFUNDED",
                        "DISPUTED",
                      ]
                    : mode === "remittances"
                      ? ["DECLARED", "CONFIRMED", "DISPUTED", "CANCELLED"]
                      : mode === "corrections"
                        ? ["PENDING", "APPROVED", "REJECTED"]
                        : ["OPEN", "REVIEW", "RESOLVED", "CLOSED"]
                  ).map((s) => (
                    <option key={s} value={s}>
                      {financeStatusLabel(s, mode === "corrections")}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </Card>
          {active.error && !["balances", "notices"].includes(mode) && (
            <ErrorState message={active.error} retry={active.reload} />
          )}
          {mode === "obligations" && (
            <Card>
              <h2>Obligations d’encaissement</h2>
              <div className="finance-table-wrap">
                <table className="finance-table">
                  <thead>
                    <tr>
                      <th>Commande</th>
                      <th>Attendu</th>
                      <th>Déclaré net</th>
                      <th>Reste à recevoir</th>
                      <th>État et actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obligations.data?.items.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <strong className="finance-reference">
                            {o.publicNumber}
                          </strong>
                          <small>
                            {o.shopName} · {o.companyName} · {o.agencyName}
                          </small>
                        </td>
                        <td>{financialMoney(o.expected, o.currency)}</td>
                        <td>{financialMoney(o.declared, o.currency)}</td>
                        <td>{financialMoney(o.remaining, o.currency)}</td>
                        <td>
                          <Badge>{financeStates[o.state] ?? o.state}</Badge>
                          {o.disputed && <Badge>Écart à examiner</Badge>}
                          {o.exception && (
                            <Badge>
                              Dérogation documentée · preuve toujours requise
                            </Badge>
                          )}
                          <div className="ds-actions">
                            {o.canDeclare && can("collections.declare") && (
                              <Button
                                onClick={() =>
                                  setForm({ code: "DECLARE", obligation: o })
                                }
                              >
                                Déclarer un encaissement
                              </Button>
                            )}
                            {can("collections.expected.request") &&
                              o.mission &&
                              (!o.mission.pickedUpAt ||
                                can("collections.expected.exception")) && (
                                <Button
                                  variant="secondary"
                                  onClick={() =>
                                    setForm({ code: "EXPECTED", obligation: o })
                                  }
                                >
                                  Corriger le montant attendu
                                </Button>
                              )}
                            {can("collections.expected.request") &&
                              o.mission?.pickedUpAt && (
                                <Button
                                  variant="secondary"
                                  onClick={() =>
                                    setForm({
                                      code: "EXCEPTION",
                                      obligation: o,
                                    })
                                  }
                                >
                                  Demander une dérogation
                                </Button>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {obligations.data?.total === 0 && (
                <EmptyState
                  title="Aucune obligation dans ce périmètre"
                  description="Les montants proviennent des commandes soumises autorisées."
                />
              )}
            </Card>
          )}
          {mode === "entries" && (
            <Card>
              <h2>Déclarations conservées</h2>
              {entries.data?.items.map((e) => (
                <div className="finance-allocation" key={e.id}>
                  <strong className="finance-reference">
                    {e.reference ?? e.publicNumber}
                  </strong>
                  <p>
                    {e.publicNumber} · {e.courierName ?? e.shopName} ·{" "}
                    {e.declaredAt
                      ? new Date(e.declaredAt).toLocaleString("fr-FR")
                      : "Historique à rapprocher"}
                  </p>
                  <p>
                    Déclaré net : {financialMoney(e.net, e.currency)}
                    {!shop &&
                      ` · À remettre / justifier : ${financialMoney(e.liability, e.currency)}`}
                  </p>
                  {e.blocked && <Badge>Régularisation en attente</Badge>}
                  <Button
                    variant="secondary"
                    onClick={() => setDetail({ kind: "collection", id: e.id })}
                  >
                    Détail de l’encaissement
                  </Button>
                </div>
              ))}
              {entries.data?.total === 0 && (
                <EmptyState
                  title="Aucun encaissement déclaré"
                  description="Affecter une mission ne génère pas de paiement."
                />
              )}
            </Card>
          )}
          {mode === "remittances" && (
            <Card>
              <h2>Remises déclarées et réceptions</h2>
              {remittances.data?.items.map((r) => (
                <div className="finance-allocation" key={r.id}>
                  <strong className="finance-reference">{r.reference}</strong>
                  <p>
                    {r.courierName} ·{" "}
                    {financialMoney(r.declaredAmount, r.currency)} déclaré remis
                  </p>
                  <p>
                    Constat initial confirmé :{" "}
                    {financialMoney(r.confirmedAmount ?? undefined, r.currency)}
                  </p>
                  <Badge>{financeStates[r.status] ?? r.status}</Badge>
                  <Button
                    variant="secondary"
                    onClick={() => setDetail({ kind: "remittance", id: r.id })}
                  >
                    Détail de la remise
                  </Button>
                </div>
              ))}
              {remittances.data?.total === 0 && (
                <EmptyState
                  title="Aucune remise déclarée"
                  description="Les remises regroupent des montants d’encaissements déjà documentés."
                />
              )}
            </Card>
          )}
          {mode === "balances" && (
            <Card>
              <h2>Soldes par livreur, agence et devise</h2>
              {data?.balances.map((b) => (
                <div
                  className="finance-allocation"
                  key={`${b.agencyId}:${b.courierId}:${b.currency}`}
                >
                  <strong>
                    {b.courierName} ·{" "}
                    {options.data?.agencies.find((a) => a.id === b.agencyId)
                      ?.name ?? "Agence autorisée"}
                  </strong>
                  <p>
                    Déclaré net : {financialMoney(b.net, b.currency)} · Reçu
                    confirmé : {financialMoney(b.confirmed, b.currency)}
                  </p>
                  <p>
                    À remettre / justifier :{" "}
                    <strong>{financialMoney(b.liability, b.currency)}</strong> ·
                    Engagé en attente : {financialMoney(b.reserved, b.currency)}
                  </p>
                  <p>
                    Encore disponible pour une nouvelle remise :{" "}
                    {financialMoney(b.available, b.currency)}
                  </p>
                </div>
              ))}
            </Card>
          )}
          {mode === "discrepancies" && (
            <Card>
              <h2>Écarts et litiges</h2>
              {discrepancies.data?.items.map((x) => (
                <div className="finance-allocation" key={x.id}>
                  <strong className="finance-reference">{x.reference}</strong>
                  <p>{x.description}</p>
                  <Badge>{financeStates[x.status] ?? x.status}</Badge>
                  <p>
                    {financialMoney(x.amount, x.currency)} ·{" "}
                    {new Date(x.createdAt).toLocaleString("fr-FR")}
                  </p>
                  {x.resolution && <p>Décision : {x.resolution}</p>}
                  {x.canResolve && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setForm({ code: "RESOLVE", discrepancy: x })
                      }
                    >
                      Examiner ou résoudre cet écart
                    </Button>
                  )}
                </div>
              ))}
              {discrepancies.data?.total === 0 && (
                <EmptyState
                  title="Aucun écart dans ce périmètre"
                  description="Un écart résolu reste conservé dans l’historique."
                />
              )}
            </Card>
          )}
          {mode === "corrections" && (
            <Card>
              <h2>Corrections, remboursements et exceptions</h2>
              {corrections.data?.items.map((x) => (
                <div className="finance-allocation" key={x.id}>
                  <strong>{correctionKinds[x.kind]}</strong>
                  <p>{x.reason}</p>
                  <p>{correctionSummary(x)}</p>
                  <Badge>{financeStatusLabel(x.status, true)}</Badge>
                  {x.decisionReason && <p>Décision : {x.decisionReason}</p>}
                  {x.canDecide && (
                    <Button
                      onClick={() =>
                        setForm({ code: "APPROVE", correction: x })
                      }
                    >
                      Examiner la demande
                    </Button>
                  )}
                </div>
              ))}
              {corrections.data?.total === 0 && (
                <EmptyState
                  title="Aucune régularisation"
                  description="Toute correction conserve la déclaration d’origine et exige une validation distincte."
                />
              )}
            </Card>
          )}
          {mode === "history" && (
            <Card>
              <h2>Historique des opérations autorisées</h2>
              <FinanceTimeline events={history.data?.items ?? []} />
            </Card>
          )}
          {mode === "notices" && (
            <Card>
              <h2>Avis financiers récents</h2>
              {notices.error && (
                <ErrorState message={notices.error} retry={notices.reload} />
              )}
              <FinanceTimeline
                events={(notices.data ?? []).map((n) => ({
                  id: n.id,
                  createdAt: n.createdAt,
                  action: n.payload.event ?? n.payload.action,
                  amount: n.payload.amount,
                  currency: n.payload.currency,
                  status: n.payload.status,
                }))}
              />
              {notices.data?.length === 0 && <p>Aucun avis dans cet espace.</p>}
            </Card>
          )}
          {!["balances", "notices"].includes(mode) && (
            <div className="finance-row">
              <Button
                variant="secondary"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Précédent
              </Button>
              <span>
                Page {page} · {active.data?.total ?? 0} résultat(s)
              </span>
              <Button
                variant="secondary"
                disabled={page * 20 >= (active.data?.total ?? 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </Button>
            </div>
          )}
        </>
      )}
      {form?.code === "REMIT" && !remitSource.data && (
        <Card>
          {remitSource.error ? (
            <ErrorState
              message={remitSource.error}
              retry={remitSource.reload}
            />
          ) : (
            <Skeleton />
          )}
          <Button variant="secondary" onClick={() => setForm(undefined)}>
            Revenir
          </Button>
        </Card>
      )}
      {form && (form.code !== "REMIT" || remitSource.data) && (
        <FinanceActionForm
          key={`${form.code}:${form.entry?.id ?? form.remittance?.id ?? form.correction?.id ?? form.obligation?.id ?? form.discrepancy?.id ?? "new"}`}
          target={
            form.code === "REMIT"
              ? { ...form, entries: remitSource.data?.items ?? [] }
              : form
          }
          onClose={() => setForm(undefined)}
          onDone={() => {
            setForm(undefined);
            reload();
          }}
        />
      )}
    </div>
  );
}
export function OrderFinanceSummary({
  orderId,
  context,
}: {
  orderId: string;
  context: Workspace;
}) {
  const r = useFinanceData<FinancePage<FinanceObligation>>(
      `/financial-obligations?orderId=${orderId}`,
    ),
    o = r.data?.items[0];
  return (
    <Card>
      <h2>Encaissement de la commande</h2>
      {r.error ? (
        <ErrorState message={r.error} retry={r.reload} />
      ) : o ? (
        <>
          <Badge>{financeStates[o.state] ?? o.state}</Badge>
          <p>
            Attendu : {financialMoney(o.expected, o.currency)} · Déclaré net :{" "}
            {financialMoney(o.declared, o.currency)} · Reste auprès du
            destinataire : {financialMoney(o.remaining, o.currency)}
          </p>
          <Link
            className="ds-button ds-secondary"
            to={`/portail/${context.portal}/${context.scope === "SHOP" ? "suivi-financier" : "encaissements"}?orderId=${orderId}`}
          >
            Consulter les déclarations et le suivi financier
          </Link>
        </>
      ) : (
        <p>Le suivi sera visible dans votre périmètre autorisé.</p>
      )}
    </Card>
  );
}
