import { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Workspace } from "../auth/types";
import {
  Button,
  Card,
  Badge,
  Input,
  Selector,
  EmptyState,
  ErrorMessage,
  Loading,
  ui,
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
const modes = [
  { id: "obligations", label: "Montants attendus" },
  { id: "entries", label: "Déclarations d’encaissement" },
  { id: "remittances", label: "Remises de fonds" },
  { id: "balances", label: "Soldes par livreur et agence" },
  { id: "discrepancies", label: "Écarts et litiges" },
  { id: "corrections", label: "Corrections et régularisations" },
  { id: "history", label: "Historique financier" },
  { id: "notices", label: "Avis financiers" },
];
export function FinanceTimeline({ events }: { events: FinanceEvent[] }) {
  return (
    <View style={ui.stack}>
      {events.map((e) => (
        <View key={e.id} style={ui.stack}>
          <Text style={ui.rowTitle}>{financeEvents[e.action] ?? e.action}</Text>
          <Text style={ui.body}>
            {e.actorName ? `${e.actorName} · ` : ""}
            {new Date(e.createdAt).toLocaleString("fr-FR")} ·{" "}
            {financialMoney(e.amount, e.currency)}
          </Text>
          {!!e.reason && <Text style={ui.body}>{e.reason}</Text>}
          {!!e.status && (
            <Badge>
              {financeStatusLabel(e.status, e.action.startsWith("CORRECTION_"))}
            </Badge>
          )}
        </View>
      ))}
    </View>
  );
}
export function FinanceScreen({
  context,
  moduleId,
  scrollToTop,
}: {
  context: Workspace;
  moduleId: string;
  scrollToTop: () => void;
}) {
  const params = useLocalSearchParams<{ orderId?: string }>(),
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
    [filtersOpen, setFiltersOpen] = useState(false),
    [detail, setDetail] = useState<{
      kind: "collection" | "remittance";
      id: string;
    }>(),
    [form, setForm] = useState<FinanceFormTarget>();
  const query = new URLSearchParams({
    page: String(page),
    size: "10",
    q,
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    ...(params.orderId ? { orderId: params.orderId } : {}),
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
      form?.code === "REMIT" ? "/collections?size=50" : null,
    ),
    collection = useFinanceData<FinanceEntryDetail>(
      detail?.kind === "collection" ? `/collections/${detail.id}` : null,
    ),
    remittance = useFinanceData<FinanceRemittance>(
      detail?.kind === "remittance" ? `/cash-remittances/${detail.id}` : null,
    );
  const data = overview.data,
    permissions = data?.permissions ?? context.permissions,
    shop = context.scope === "SHOP",
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
  const open = (target: FinanceFormTarget) => {
      setForm(target);
      scrollToTop();
    },
    updateFilter = (key: string, value: string) => {
      setFilters((v) => ({ ...v, [key]: value }));
      setPage(1);
    };
  const entry = collection.data?.entry,
    r = remittance.data;
  if (form) {
    if (form.code === "REMIT" && !remitSource.data)
      return (
        <View style={ui.stack}>
          <Button
            title="Revenir sans enregistrer"
            secondary
            onPress={() => setForm(undefined)}
          />
          {remitSource.error ? (
            <ErrorMessage
              message={remitSource.error}
              retry={remitSource.reload}
            />
          ) : (
            <Loading />
          )}
        </View>
      );
    return (
      <FinanceActionForm
        target={
          form.code === "REMIT"
            ? { ...form, entries: remitSource.data?.items ?? [] }
            : form
        }
        onClose={() => {
          setForm(undefined);
          scrollToTop();
        }}
        onDone={() => {
          setForm(undefined);
          reload();
          scrollToTop();
        }}
        scrollToTop={scrollToTop}
      />
    );
  }
  if (detail)
    return (
      <View style={ui.stack}>
        <Button
          title="Retour à la liste financière"
          secondary
          onPress={() => {
            setDetail(undefined);
            scrollToTop();
          }}
        />
        {!!(collection.error || remittance.error) && (
          <ErrorMessage
            message={collection.error ?? remittance.error ?? ""}
            retry={reload}
          />
        )}
        {detail.kind === "collection" && entry && (
          <>
            <Text role="heading" style={ui.sectionTitle}>
              {entry.reference ?? entry.publicNumber}
            </Text>
            <Card>
              <Text style={ui.body}>{entry.publicNumber}</Text>
              <Text style={ui.rowTitle}>
                {entry.courierName ?? entry.shopName ?? "Votre commande"}
              </Text>
              <Text style={ui.body}>
                Attendu lors de la déclaration :{" "}
                {financialMoney(entry.expectedSnapshot, entry.currency)}
              </Text>
              <Text style={ui.body}>
                Déclaration d’origine :{" "}
                {financialMoney(entry.declaredAmount ?? "0", entry.currency)}
              </Text>
              <Text style={ui.body}>
                Déclaré valide après corrections :{" "}
                {financialMoney(entry.gross, entry.currency)}
              </Text>
              <Text style={ui.body}>
                Remboursé hors plateforme :{" "}
                {financialMoney(entry.refunded, entry.currency)}
              </Text>
              {!shop && (
                <>
                  <Text style={ui.body}>
                    Confirmé reçu par l’agence :{" "}
                    {financialMoney(entry.confirmed, entry.currency)}
                  </Text>
                  <Text style={ui.body}>
                    Remboursé par le livreur :{" "}
                    {financialMoney(entry.courierRefunded, entry.currency)} ·
                    par l’agence :{" "}
                    {financialMoney(entry.agencyRefunded, entry.currency)}
                  </Text>
                  <Text style={ui.body}>
                    Réceptions nettes après remboursements de l’agence :{" "}
                    {financialMoney(entry.agencyRetained, entry.currency)}
                  </Text>
                  <Text style={ui.sectionTitle}>
                    À remettre / justifier :{" "}
                    {financialMoney(entry.liability, entry.currency)}
                  </Text>
                  <Text style={ui.body}>
                    Engagé en attente :{" "}
                    {financialMoney(entry.reserved, entry.currency)}
                  </Text>
                  <Text style={ui.body}>
                    Moyen externe :{" "}
                    {paymentMethods.find((m) => m.value === entry.method)
                      ?.label ?? entry.method}
                  </Text>
                  {!!entry.notes && <Text style={ui.body}>{entry.notes}</Text>}
                </>
              )}
              {entry.blocked && (
                <Badge>Régularisation en attente de décision</Badge>
              )}
              {entry.legacy && <Badge>Historique à rapprocher</Badge>}
              {!shop &&
                !entry.legacy &&
                (can("financial.corrections.request") ||
                  can("financial.corrections.self.request")) &&
                !entry.blocked && (
                  <Button
                    title="Demander une régularisation"
                    onPress={() =>
                      open({
                        code: "CORRECT",
                        entry,
                        allowAgencyRefund: can("financial.corrections.request"),
                      })
                    }
                  />
                )}
              {can("financial.discrepancies.manage") && (
                <Button
                  title="Signaler un écart"
                  secondary
                  onPress={() => open({ code: "REPORT", entry })}
                />
              )}
            </Card>
            {!shop &&
              entry.items?.map((i) => (
                <Card key={i.id}>
                  <Text style={ui.rowTitle}>{i.reference}</Text>
                  <Text style={ui.body}>
                    Déclaré remis : {financialMoney(i.declared, entry.currency)}
                  </Text>
                  <Text style={ui.body}>
                    Réellement confirmé :{" "}
                    {financialMoney(i.confirmed, entry.currency)}
                  </Text>
                  <Badge>{financeStates[i.status] ?? i.status}</Badge>
                </Card>
              ))}
            <Card>
              <Text style={ui.sectionTitle}>Historique autorisé</Text>
              <FinanceTimeline events={collection.data?.events ?? []} />
            </Card>
          </>
        )}
        {detail.kind === "remittance" && r && (
          <>
            <Text role="heading" style={ui.sectionTitle}>
              {r.reference}
            </Text>
            <Card>
              <Text style={ui.rowTitle}>{r.courierName}</Text>
              <Text style={ui.body}>
                {new Date(r.declaredAt).toLocaleString("fr-FR")}
              </Text>
              <Badge>{financeStates[r.status] ?? r.status}</Badge>
              <Text style={ui.sectionTitle}>
                Déclaré remis : {financialMoney(r.declaredAmount, r.currency)}
              </Text>
              <Text style={ui.body}>
                Constat initial confirmé :{" "}
                {financialMoney(r.confirmedAmount ?? undefined, r.currency)}
              </Text>
              <Text style={ui.body}>
                Reçu après régularisations :{" "}
                {r.confirmedAt
                  ? financialMoney(r.effectiveConfirmedAmount, r.currency)
                  : "En attente de constat"}
              </Text>
              <Text style={ui.body}>
                Constaté par : {r.confirmedByName ?? "En attente de réception"}
              </Text>
              {!!r.decisionReason && (
                <Text style={ui.body}>Décision : {r.decisionReason}</Text>
              )}
              {!!r.notes && <Text style={ui.body}>{r.notes}</Text>}
              {r.canConfirm && (
                <Button
                  title="Confirmer ou contester la réception"
                  onPress={() => open({ code: "DECIDE", remittance: r })}
                />
              )}
              {can("financial.discrepancies.manage") && (
                <Button
                  secondary
                  title="Signaler un écart sur cette remise"
                  onPress={() => open({ code: "REPORT", remittance: r })}
                />
              )}
            </Card>
            {r.items?.map((i) => (
              <Card key={i.id}>
                <Text style={ui.rowTitle}>{i.reference ?? i.publicNumber}</Text>
                <Text style={ui.body}>
                  Déclaré remis :{" "}
                  {financialMoney(i.declaredAmount ?? undefined, r.currency)}
                </Text>
                <Text style={ui.body}>
                  Constat initial :{" "}
                  {financialMoney(i.confirmedAmount ?? undefined, r.currency)}
                </Text>
                <Text style={ui.body}>
                  Reçu après régularisations :{" "}
                  {financialMoney(i.effectiveConfirmed, r.currency)}
                </Text>
                {can("financial.corrections.request") &&
                  ["CONFIRM", "DISPUTE"].includes(r.decision ?? "") && (
                    <Button
                      secondary
                      title="Demander une correction de cette réception"
                      onPress={() =>
                        open({
                          code: "RECEIPT",
                          remittance: r,
                          receiptItemId: i.id,
                        })
                      }
                    />
                  )}
              </Card>
            ))}
            <Card>
              <Text style={ui.sectionTitle}>Décisions conservées</Text>
              <FinanceTimeline events={r.events ?? []} />
            </Card>
          </>
        )}
        {!entry && !r && !collection.error && !remittance.error && <Loading />}
      </View>
    );
  return (
    <View style={ui.stack}>
      <Text style={ui.kicker}>TRAÇABILITÉ DES PAIEMENTS EXTERNES</Text>
      <Text role="heading" style={ui.sectionTitle}>
        {shop
          ? "Suivi financier de vos commandes"
          : driver
            ? "Mes encaissements et remises"
            : "Finances de vos agences"}
      </Text>
      <Text style={ui.body}>
        DND Delivery enregistre les déclarations et confirmations. Aucun
        paiement n’est exécuté par l’application.
      </Text>
      <Text style={ui.body}>
        {overview.lastSync
          ? `Actualisé à ${new Date(overview.lastSync).toLocaleTimeString("fr-FR")}`
          : "Chargement des montants…"}{" "}
        · Toutes les 30 secondes lorsque cet écran est actif.
      </Text>
      <Button title="Actualiser les finances" secondary onPress={reload} />
      {!!overview.error && (
        <ErrorMessage message={overview.error} retry={overview.reload} />
      )}
      {!data && !overview.error && <Loading />}
      {data?.money.map((m) => (
        <Card key={m.currency}>
          <Text style={ui.sectionTitle}>{m.currency}</Text>
          <Text style={ui.body}>
            Attendu : {financialMoney(m.expected, m.currency)}
          </Text>
          <Text style={ui.body}>
            Encaissements déclarés nets : {financialMoney(m.net, m.currency)}
          </Text>
          <Text style={ui.body}>
            Remboursements externes : {financialMoney(m.refunded, m.currency)}
          </Text>
          <Text style={ui.body}>
            Reste auprès des destinataires :{" "}
            {financialMoney(m.remaining, m.currency)}
          </Text>
          {!shop && (
            <>
              <Text style={ui.body}>
                Encaissements valides avant remboursements :{" "}
                {financialMoney(m.gross, m.currency)}
              </Text>
              <Text style={ui.body}>
                Remboursé par les agences :{" "}
                {financialMoney(m.agencyRefunded, m.currency)}
              </Text>
              <Text style={ui.body}>
                Réceptions nettes après remboursements d’agence :{" "}
                {financialMoney(m.agencyRetained, m.currency)}
              </Text>
              <Text style={ui.body}>
                Confirmé reçu par l’agence :{" "}
                {financialMoney(m.confirmed, m.currency)}
              </Text>
              <Text style={ui.sectionTitle}>
                À remettre / justifier :{" "}
                {financialMoney(m.liability, m.currency)}
              </Text>
              <Text style={ui.body}>
                Engagé en attente : {financialMoney(m.reserved, m.currency)}
              </Text>
            </>
          )}
          {!!m.unreconciled && (
            <Text style={ui.body}>
              Historique à rapprocher : {m.unreconciled} déclaration(s), exclues
              des nouveaux soldes.
            </Text>
          )}
        </Card>
      ))}
      {!shop && (
        <Text style={ui.body}>
          {data?.pendingRemittances ?? 0} remise(s) en attente ·{" "}
          {data?.openDiscrepancies ?? 0} écart(s) ouvert(s)
        </Text>
      )}
      <Selector
        label="Opérations financières"
        value={mode}
        options={shop ? modes.slice(0, 2) : modes}
        onChange={(value) => {
          setMode(value);
          setPage(1);
          setFilters({});
          scrollToTop();
        }}
      />
      {can("remittances.declare") && (
        <Button
          title="Déclarer une remise"
          onPress={() =>
            open({
              code: "REMIT",
              agencyId: context.agencyId,
              currencies: data?.money
                .filter((m) => m.available && m.available !== "0.0000")
                .map((m) => m.currency),
            })
          }
        />
      )}
      <Button
        title={
          filtersOpen ? "Masquer les filtres financiers" : "Filtres financiers"
        }
        secondary
        onPress={() => setFiltersOpen((v) => !v)}
      />
      {filtersOpen && (
        <Card>
          <Input
            label="Référence ou boutique"
            value={q}
            onChangeText={(value) => {
              setQ(value);
              setPage(1);
            }}
          />
          <Input
            label="Devise"
            autoCapitalize="characters"
            maxLength={3}
            value={filters.currency ?? ""}
            onChangeText={(value) =>
              updateFilter("currency", value.toUpperCase())
            }
          />
          {!shop && options.data?.agencies.length !== 1 && (
            <Selector
              label="Agence financière"
              value={filters.agencyId ?? ""}
              options={[
                { id: "", label: "Toutes les agences autorisées" },
                ...(options.data?.agencies ?? []).map((x) => ({
                  id: x.id,
                  label: x.name,
                })),
              ]}
              onChange={(value) => updateFilter("agencyId", value)}
            />
          )}
          {shop && !context.companyId && (
            <Selector
              label="Agence de livraison"
              value={filters.companyId ?? ""}
              options={[
                { id: "", label: "Toutes mes agences de livraison" },
                ...(options.data?.companies ?? []).map((x) => ({
                  id: x.id,
                  label: x.name,
                })),
              ]}
              onChange={(value) => updateFilter("companyId", value)}
            />
          )}
          <Input
            label="Du (AAAA-MM-JJ)"
            value={filters.from ?? ""}
            onChangeText={(value) => updateFilter("from", value)}
          />
          <Input
            label="Au (AAAA-MM-JJ)"
            value={filters.to ?? ""}
            onChangeText={(value) => updateFilter("to", value)}
          />
          {[
            "obligations",
            "remittances",
            "discrepancies",
            "corrections",
          ].includes(mode) && (
            <Selector
              label="État financier"
              value={filters.status ?? ""}
              options={[
                { id: "", label: "Tous les états" },
                ...(mode === "obligations"
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
                ).map((id) => ({
                  id,
                  label: financeStatusLabel(id, mode === "corrections"),
                })),
              ]}
              onChange={(value) => updateFilter("status", value)}
            />
          )}
        </Card>
      )}
      {!!active.error && !["balances", "notices"].includes(mode) && (
        <ErrorMessage message={active.error} retry={active.reload} />
      )}
      {mode === "obligations" && (
        <>
          <Text style={ui.sectionTitle}>Obligations d’encaissement</Text>
          {obligations.data?.items.map((o) => (
            <Card key={o.id}>
              <Text style={ui.rowTitle}>{o.publicNumber}</Text>
              <Text style={ui.body}>
                {o.shopName} · {o.companyName} · {o.agencyName}
              </Text>
              <Badge>{financeStates[o.state] ?? o.state}</Badge>
              <Text style={ui.body}>
                Attendu : {financialMoney(o.expected, o.currency)}
              </Text>
              <Text style={ui.body}>
                Déclaré net : {financialMoney(o.declared, o.currency)}
              </Text>
              <Text style={ui.sectionTitle}>
                Reste à recevoir : {financialMoney(o.remaining, o.currency)}
              </Text>
              {o.disputed && <Badge>Écart à examiner</Badge>}
              {o.exception && (
                <Badge>Dérogation documentée · preuve toujours requise</Badge>
              )}
              {o.canDeclare && can("collections.declare") && (
                <Button
                  title="Déclarer un encaissement"
                  onPress={() => open({ code: "DECLARE", obligation: o })}
                />
              )}
              {can("collections.expected.request") &&
                o.mission &&
                (!o.mission.pickedUpAt ||
                  can("collections.expected.exception")) && (
                  <Button
                    title="Corriger le montant attendu"
                    secondary
                    onPress={() => open({ code: "EXPECTED", obligation: o })}
                  />
                )}
              {can("collections.expected.request") && o.mission?.pickedUpAt && (
                <Button
                  title="Demander une dérogation"
                  secondary
                  onPress={() => open({ code: "EXCEPTION", obligation: o })}
                />
              )}
            </Card>
          ))}
          {obligations.data?.total === 0 && (
            <EmptyState
              title="Aucune obligation dans ce périmètre"
              description="Les montants proviennent des commandes soumises autorisées."
            />
          )}
        </>
      )}
      {mode === "entries" && (
        <>
          <Text style={ui.sectionTitle}>Déclarations conservées</Text>
          {entries.data?.items.map((e) => (
            <Card key={e.id}>
              <Text style={ui.rowTitle}>{e.reference ?? e.publicNumber}</Text>
              <Text style={ui.body}>
                {e.publicNumber} · {e.courierName ?? e.shopName}
              </Text>
              <Text style={ui.body}>
                Déclaré net : {financialMoney(e.net, e.currency)}
              </Text>
              {!shop && (
                <Text style={ui.sectionTitle}>
                  À remettre / justifier :{" "}
                  {financialMoney(e.liability, e.currency)}
                </Text>
              )}
              {e.blocked && <Badge>Régularisation en attente</Badge>}
              <Button
                title="Détail de l’encaissement"
                secondary
                onPress={() => {
                  setDetail({ kind: "collection", id: e.id });
                  scrollToTop();
                }}
              />
            </Card>
          ))}
          {entries.data?.total === 0 && (
            <EmptyState
              title="Aucun encaissement déclaré"
              description="Affecter une mission ne génère aucun paiement."
            />
          )}
        </>
      )}
      {mode === "remittances" && (
        <>
          <Text style={ui.sectionTitle}>Remises et réceptions</Text>
          {remittances.data?.items.map((r) => (
            <Card key={r.id}>
              <Text style={ui.rowTitle}>{r.reference}</Text>
              <Text style={ui.body}>{r.courierName}</Text>
              <Badge>{financeStates[r.status] ?? r.status}</Badge>
              <Text style={ui.sectionTitle}>
                Déclaré remis : {financialMoney(r.declaredAmount, r.currency)}
              </Text>
              <Text style={ui.body}>
                Constat initial confirmé :{" "}
                {financialMoney(r.confirmedAmount ?? undefined, r.currency)}
              </Text>
              <Button
                title="Détail de la remise"
                secondary
                onPress={() => {
                  setDetail({ kind: "remittance", id: r.id });
                  scrollToTop();
                }}
              />
            </Card>
          ))}
          {remittances.data?.total === 0 && (
            <EmptyState
              title="Aucune remise déclarée"
              description="Sélectionnez des encaissements pour documenter une remise physique à l’agence."
            />
          )}
        </>
      )}
      {mode === "balances" && (
        <>
          <Text style={ui.sectionTitle}>Soldes par livreur et agence</Text>
          {data?.balances.map((b) => (
            <Card key={`${b.agencyId}:${b.courierId}:${b.currency}`}>
              <Text style={ui.rowTitle}>{b.courierName}</Text>
              <Text style={ui.body}>
                {options.data?.agencies.find((a) => a.id === b.agencyId)
                  ?.name ?? "Agence autorisée"}
              </Text>
              <Text style={ui.body}>
                Déclaré net : {financialMoney(b.net, b.currency)}
              </Text>
              <Text style={ui.body}>
                Reçu confirmé : {financialMoney(b.confirmed, b.currency)}
              </Text>
              <Text style={ui.sectionTitle}>
                À remettre / justifier :{" "}
                {financialMoney(b.liability, b.currency)}
              </Text>
              <Text style={ui.body}>
                Engagé en attente : {financialMoney(b.reserved, b.currency)}
              </Text>
              <Text style={ui.body}>
                Disponible pour une nouvelle remise :{" "}
                {financialMoney(b.available, b.currency)}
              </Text>
            </Card>
          ))}
        </>
      )}
      {mode === "discrepancies" && (
        <>
          <Text style={ui.sectionTitle}>Écarts et litiges</Text>
          {discrepancies.data?.items.map((x) => (
            <Card key={x.id}>
              <Text style={ui.rowTitle}>{x.reference}</Text>
              <Text style={ui.body}>{x.description}</Text>
              <Badge>{financeStates[x.status] ?? x.status}</Badge>
              <Text style={ui.sectionTitle}>
                {financialMoney(x.amount, x.currency)}
              </Text>
              {!!x.resolution && (
                <Text style={ui.body}>Décision : {x.resolution}</Text>
              )}
              {x.canResolve && (
                <Button
                  title="Examiner ou résoudre cet écart"
                  onPress={() => open({ code: "RESOLVE", discrepancy: x })}
                />
              )}
            </Card>
          ))}
          {discrepancies.data?.total === 0 && (
            <EmptyState
              title="Aucun écart dans ce périmètre"
              description="Les écarts résolus restent dans l’historique."
            />
          )}
        </>
      )}
      {mode === "corrections" && (
        <>
          <Text style={ui.sectionTitle}>Corrections et régularisations</Text>
          {corrections.data?.items.map((x) => (
            <Card key={x.id}>
              <Text style={ui.rowTitle}>{correctionKinds[x.kind]}</Text>
              <Text style={ui.body}>{x.reason}</Text>
              <Text style={ui.body}>{correctionSummary(x)}</Text>
              <Badge>{financeStatusLabel(x.status, true)}</Badge>
              {!!x.decisionReason && (
                <Text style={ui.body}>Décision : {x.decisionReason}</Text>
              )}
              {x.canDecide && (
                <Button
                  title="Examiner la demande"
                  onPress={() => open({ code: "APPROVE", correction: x })}
                />
              )}
            </Card>
          ))}
          {corrections.data?.total === 0 && (
            <EmptyState
              title="Aucune régularisation"
              description="Les corrections conservent l’origine et exigent une autre personne autorisée."
            />
          )}
        </>
      )}
      {mode === "history" && (
        <Card>
          <Text style={ui.sectionTitle}>Historique financier</Text>
          <FinanceTimeline events={history.data?.items ?? []} />
        </Card>
      )}
      {mode === "notices" && (
        <Card>
          <Text style={ui.sectionTitle}>Avis financiers récents</Text>
          {!!notices.error && (
            <ErrorMessage message={notices.error} retry={notices.reload} />
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
          {notices.data?.length === 0 && (
            <Text style={ui.body}>Aucun avis dans cet espace.</Text>
          )}
        </Card>
      )}
      {!["balances", "notices"].includes(mode) && (
        <>
          <Text style={ui.body}>
            Page {page} · {active.data?.total ?? 0} résultat(s)
          </Text>
          <View style={ui.stack}>
            <Button
              secondary
              title="Précédent"
              disabled={page === 1}
              onPress={() => {
                setPage((p) => p - 1);
                scrollToTop();
              }}
            />
            <Button
              secondary
              title="Suivant"
              disabled={page * 10 >= (active.data?.total ?? 0)}
              onPress={() => {
                setPage((p) => p + 1);
                scrollToTop();
              }}
            />
          </View>
        </>
      )}
    </View>
  );
}
export function OrderFinanceSummary({
  orderId,
  context,
}: {
  orderId: string;
  context: Workspace;
}) {
  const router = useRouter(),
    r = useFinanceData<FinancePage<FinanceObligation>>(
      `/financial-obligations?orderId=${orderId}`,
    ),
    o = r.data?.items[0];
  return (
    <Card>
      <Text style={ui.sectionTitle}>Encaissement de la commande</Text>
      {r.error ? (
        <ErrorMessage message={r.error} retry={r.reload} />
      ) : o ? (
        <>
          <Badge>{financeStates[o.state] ?? o.state}</Badge>
          <Text style={ui.body}>
            Attendu : {financialMoney(o.expected, o.currency)}
          </Text>
          <Text style={ui.body}>
            Déclaré net : {financialMoney(o.declared, o.currency)}
          </Text>
          <Text style={ui.body}>
            Reste auprès du destinataire :{" "}
            {financialMoney(o.remaining, o.currency)}
          </Text>
          <Button
            secondary
            title="Consulter les déclarations et le suivi financier"
            onPress={() =>
              router.push({
                pathname: "/espace/[module]",
                params: {
                  module:
                    context.scope === "SHOP"
                      ? "suivi-financier"
                      : "encaissements",
                  orderId,
                },
              })
            }
          />
        </>
      ) : (
        <Text style={ui.body}>
          Le suivi sera visible dans votre périmètre autorisé.
        </Text>
      )}
    </Card>
  );
}
