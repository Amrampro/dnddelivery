import { useState } from "react";
import { Text, View } from "react-native";
import type { Workspace } from "../auth/types";
import { api } from "../auth/client";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Input,
  ListRow,
  Selector,
  Sheet,
  ui,
} from "../design/ui";
import { CatalogScreen } from "./CatalogScreen";
import { OperationForm } from "./OperationForm";
import { OperationDetail } from "./OperationDetail";
import {
  date,
  labels,
  LoadState,
  Pager,
  quantity,
  useStockData,
  type Page,
} from "./ui";
import {
  creationTitles,
  paths,
  titles,
  writePermissions,
  type Movement,
  type Operation,
  type OperationKind,
  type Options,
  type Stock,
} from "./models";
export const stockMobileModuleIds = [
  "produits",
  "stocks",
  "depots",
  "mouvements",
  "sorties",
  "reservations",
  "transferts-stock",
  "inventaires",
  "alertes-stock",
];
interface Filters {
  q: string;
  companyId: string;
  agencyId: string;
  shopId: string;
  status: string;
}
const query = (filters: Filters, page: number) =>
  new URLSearchParams(
    Object.entries({ ...filters, page: String(page), size: "15" }).filter(
      ([, value]) => value !== "",
    ),
  ).toString();
function SearchFilters({
  context,
  options,
  filters,
  onChange,
  statusOptions,
}: {
  context: Workspace;
  options: Options;
  filters: Filters;
  onChange: (values: Partial<Filters>) => void;
  statusOptions?: { id: string; label: string }[];
}) {
  const [q, setQ] = useState(filters.q);
  return (
    <Card>
      <Input
        label="Rechercher un produit ou une référence"
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => onChange({ q: q.trim() })}
      />
      <Button
        secondary
        title="Rechercher"
        onPress={() => onChange({ q: q.trim() })}
      />
      {context.scope === "SHOP" && (
        <Selector
          label="Entreprise de conservation"
          value={filters.companyId}
          options={[
            { id: "", label: "Toutes mes agences de livraison" },
            ...options.companies.map((c) => ({ id: c.id, label: c.name })),
          ]}
          onChange={(companyId) => onChange({ companyId, agencyId: "" })}
        />
      )}
      <Selector
        label="Agence"
        value={filters.agencyId}
        disabled={!!context.agencyId}
        options={[
          { id: "", label: "Toutes les agences autorisées" },
          ...options.agencies
            .filter(
              (a) =>
                !filters.companyId ||
                !a.companyId ||
                a.companyId === filters.companyId,
            )
            .map((a) => ({
              id: a.id,
              label:
                context.scope === "SHOP" && !filters.companyId
                  ? `${options.companies.find((c) => c.id === a.companyId)?.name ?? "Agence de livraison"} · ${a.name}`
                  : a.name,
            })),
        ]}
        onChange={(agencyId) => onChange({ agencyId })}
      />
      {context.scope !== "SHOP" && (
        <Selector
          label="Boutique propriétaire"
          value={filters.shopId}
          options={[
            { id: "", label: "Toutes les boutiques autorisées" },
            ...options.shops.map((s) => ({ id: s.id, label: s.name })),
          ]}
          onChange={(shopId) => onChange({ shopId })}
        />
      )}
      {!!statusOptions && (
        <Selector
          label="Statut"
          value={filters.status}
          options={statusOptions}
          onChange={(status) => onChange({ status })}
        />
      )}
    </Card>
  );
}
function Summary({ filters }: { filters: Filters }) {
  const r = useStockData<{
    physicalQuantity: number;
    reservedQuantity: number;
    availableQuantity: number;
    inTransitQuantity: number;
    lowStockCount: number;
    transferCount: number;
    inventoryVarianceCount: number;
  }>(`/stocks/summary?${query(filters, 1)}`);
  if (!r.data) return <LoadState error={r.error} retry={r.reload} />;
  const values = [
    ["Unités physiques", r.data.physicalQuantity],
    ["Unités réservées", r.data.reservedQuantity],
    ["Unités disponibles", r.data.availableQuantity],
    ["Unités en transit", r.data.inTransitQuantity],
    ["Stocks faibles", r.data.lowStockCount],
    ["Transferts en cours", r.data.transferCount],
    ["Écarts d’inventaire", r.data.inventoryVarianceCount],
  ];
  return (
    <Card>
      <Text role="heading" style={ui.sectionTitle}>
        Situation du périmètre sélectionné
      </Text>
      {values.map(([label, value]) => (
        <View
          key={label}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Text style={ui.body}>{label}</Text>
          <Text style={ui.rowTitle}>{value}</Text>
        </View>
      ))}
      <Text style={ui.body}>
        Disponible = physique − réservé. Les unités en transit sont présentées
        séparément.
      </Text>
      <Button secondary title="Actualiser les totaux" onPress={r.reload} />
    </Card>
  );
}
function BalanceDetail({
  id,
  context,
  onBack,
}: {
  id: string;
  context: Workspace;
  onBack: () => void;
}) {
  const r = useStockData<Stock>(`/stocks/${id}`),
    [edit, setEdit] = useState(false),
    [threshold, setThreshold] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!r.data) return <LoadState error={r.error} retry={r.reload} />;
  const s = r.data;
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/stocks/${id}/threshold`, {
        method: "PATCH",
        body: JSON.stringify({
          version: s.version,
          alertThreshold: quantity(threshold, true),
        }),
      });
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
      <Button secondary title="Retour aux stocks" onPress={onBack} />
      <Card>
        <Text role="heading" style={ui.sectionTitle}>
          {s.product.name}
        </Text>
        <Text style={ui.body}>
          {s.product.sku ?? "Sans SKU"} · {s.product.unit}
          {"\n"}Propriétaire : {s.shop.name}
          {"\n"}Conservation : {s.company.name}
          {"\n"}Agence : {s.agency.name}
        </Text>
        <Text style={ui.body}>
          Physique : {s.physicalQuantity}
          {"\n"}Réservé : {s.reservedQuantity}
          {"\n"}Disponible : {s.availableQuantity}
          {"\n"}En transit : {s.inTransitQuantity}
          {"\n"}Seuil d’alerte : {s.alertThreshold ?? "Non défini"}
        </Text>
        {s.alertThreshold !== null &&
          s.availableQuantity <= s.alertThreshold && (
            <Badge>
              {s.availableQuantity === 0 ? "Rupture" : "Stock faible"}
            </Badge>
          )}
        {context.scope !== "SHOP" &&
          context.permissions.includes("stocks.threshold") &&
          context.subscriptionAccess?.valid !== false && (
            <Button
              secondary
              title="Configurer le seuil d’alerte"
              onPress={() => {
                setThreshold(String(s.alertThreshold ?? 0));
                setEdit(true);
                setError("");
              }}
            />
          )}
        <Button secondary title="Actualiser" onPress={r.reload} />
      </Card>
      <Sheet
        open={edit}
        onClose={() => {
          if (!busy) setEdit(false);
        }}
        title="Seuil de stock faible"
      >
        <Input
          label="Seuil (entier positif ou nul)"
          keyboardType="number-pad"
          value={threshold}
          onChangeText={setThreshold}
        />
        {!!error && <ErrorMessage message={error} />}
        <Button
          title="Enregistrer le seuil"
          busy={busy}
          onPress={() => void save()}
        />
      </Sheet>
    </>
  );
}
function Balances({
  context,
  alerts = false,
}: {
  context: Workspace;
  alerts?: boolean;
}) {
  const [page, setPage] = useState(1),
    [filters, setFilters] = useState<Filters>({
      q: "",
      companyId: context.scope === "SHOP" ? (context.companyId ?? "") : "",
      agencyId: context.agencyId ?? "",
      shopId: "",
      status: "",
    }),
    [selected, setSelected] = useState(""),
    options = useStockData<Options>("/stocks/options"),
    r = useStockData<Page<Stock>>(
      `${alerts ? "/stocks/alerts" : "/stocks"}?${query(filters, page)}`,
    );
  if (selected)
    return (
      <BalanceDetail
        id={selected}
        context={context}
        onBack={() => {
          setSelected("");
          r.reload();
        }}
      />
    );
  if (!options.data)
    return <LoadState error={options.error} retry={options.reload} />;
  return (
    <>
      <Text role="heading" style={ui.sectionTitle}>
        {alerts ? "Alertes de stock" : "Stocks détenus en agence"}
      </Text>
      <SearchFilters
        context={context}
        options={options.data}
        filters={filters}
        onChange={(values) => {
          setFilters((f) => ({ ...f, ...values }));
          setPage(1);
        }}
        statusOptions={
          alerts
            ? undefined
            : [
                { id: "", label: "Tous les stocks" },
                { id: "OUT_OF_STOCK", label: "Rupture" },
                { id: "LOW", label: "Stock faible" },
                { id: "AVAILABLE", label: "Disponible" },
              ]
        }
      />
      {!alerts && <Summary filters={filters} />}
      {!r.data ? (
        <LoadState error={r.error} retry={r.reload} />
      ) : (
        <>
          <Card>
            {r.data.items.map((s) => (
              <ListRow
                key={s.id}
                title={s.product.name}
                description={`${s.shop.name} · ${s.company.name}\n${s.agency.name} · Physique ${s.physicalQuantity} · Réservé ${s.reservedQuantity}\nDisponible ${s.availableQuantity} · Transit ${s.inTransitQuantity}`}
                icon="layers"
                trailing={
                  s.alertThreshold !== null &&
                  s.availableQuantity <= s.alertThreshold ? (
                    <Badge>
                      {s.availableQuantity === 0 ? "Rupture" : "Stock faible"}
                    </Badge>
                  ) : undefined
                }
                onPress={() => setSelected(s.id)}
              />
            ))}
            {!r.data.items.length && (
              <EmptyState
                title={
                  alerts ? "Aucune alerte de stock" : "Aucun stock à afficher"
                }
                description={
                  alerts
                    ? "Les seuils définis sont contrôlés à partir des quantités disponibles."
                    : "Les quantités apparaîtront après confirmation d’un dépôt physique."
                }
                icon="layers"
              />
            )}
            <Button secondary title="Actualiser" onPress={r.reload} />
          </Card>
          <Pager page={page} total={r.data.total} setPage={setPage} />
        </>
      )}
    </>
  );
}
function Movements({ context }: { context: Workspace }) {
  const [page, setPage] = useState(1),
    [filters, setFilters] = useState<Filters>({
      q: "",
      companyId: context.scope === "SHOP" ? (context.companyId ?? "") : "",
      agencyId: context.agencyId ?? "",
      shopId: "",
      status: "",
    }),
    options = useStockData<Options>("/stocks/options"),
    r = useStockData<Page<Movement>>(
      `/stocks/movements?${query(filters, page)}`,
    );
  if (!options.data)
    return <LoadState error={options.error} retry={options.reload} />;
  return (
    <>
      <Text role="heading" style={ui.sectionTitle}>
        Mouvements de stock
      </Text>
      <SearchFilters
        context={context}
        options={options.data}
        filters={filters}
        onChange={(values) => {
          setFilters((f) => ({ ...f, ...values }));
          setPage(1);
        }}
      />
      {!r.data ? (
        <LoadState error={r.error} retry={r.reload} />
      ) : (
        <>
          <Card>
            {r.data.items.map((m) => (
              <View key={m.id} style={{ gap: 7, paddingVertical: 12 }}>
                <Text style={ui.rowTitle}>
                  {labels[m.type] ?? m.type} · {m.quantity} unité(s)
                </Text>
                <Text style={ui.body}>
                  {m.stock.product.name} · {m.stock.shop.name}
                  {"\n"}
                  {m.stock.company.name} · {m.stock.agency.name}
                  {"\n"}Physique : {m.physicalBefore} → {m.physicalAfter}
                  {"\n"}Réservé : {m.reservedBefore} → {m.reservedAfter}
                  {"\n"}
                  {m.reference ?? m.operationReference ?? ""}
                  {"\n"}
                  {date(m.createdAt)}
                  {m.actor?.fullName ? " · " + m.actor.fullName : ""}
                </Text>
                {!!(m.notes ?? m.reason) && (
                  <Text style={ui.body}>{m.notes ?? m.reason}</Text>
                )}
              </View>
            ))}
            {!r.data.items.length && (
              <EmptyState
                title="Aucun mouvement à afficher"
                description="Les mouvements validés seront conservés dans ce journal."
                icon="repeat"
              />
            )}
            <Button secondary title="Actualiser" onPress={r.reload} />
          </Card>
          <Pager page={page} total={r.data.total} setPage={setPage} />
        </>
      )}
    </>
  );
}
function Operations({
  kind,
  context,
}: {
  kind: OperationKind;
  context: Workspace;
}) {
  const [page, setPage] = useState(1),
    [filters, setFilters] = useState<Filters>({
      q: "",
      companyId: context.scope === "SHOP" ? (context.companyId ?? "") : "",
      agencyId: context.agencyId ?? "",
      shopId: "",
      status: "",
    }),
    [selected, setSelected] = useState(""),
    [create, setCreate] = useState(false),
    options = useStockData<Options>("/stocks/options"),
    r = useStockData<Page<Operation>>(`${paths[kind]}?${query(filters, page)}`),
    can =
      context.scope !== "SHOP" &&
      context.permissions.includes(writePermissions[kind]) &&
      context.subscriptionAccess?.valid !== false;
  if (selected)
    return (
      <OperationDetail
        id={selected}
        kind={kind}
        context={context}
        onBack={() => {
          setSelected("");
          r.reload();
        }}
      />
    );
  if (!options.data)
    return <LoadState error={options.error} retry={options.reload} />;
  const statuses =
    kind === "depots"
      ? ["DRAFT", "CONFIRMED", "CANCELLED"]
      : kind === "transferts-stock"
        ? ["DRAFT", "IN_TRANSIT", "RECEIVED", "CANCELLED"]
        : kind === "inventaires"
          ? ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]
          : kind === "reservations"
            ? ["ACTIVE", "RELEASED", "CONSUMED"]
            : [];
  return (
    <>
      <Text role="heading" style={ui.sectionTitle}>
        {titles[kind]}
      </Text>
      <SearchFilters
        context={context}
        options={options.data}
        filters={filters}
        onChange={(values) => {
          setFilters((f) => ({ ...f, ...values }));
          setPage(1);
        }}
        statusOptions={
          statuses.length
            ? [
                { id: "", label: "Tous les statuts" },
                ...statuses.map((value) => ({
                  id: value,
                  label:
                    kind === "transferts-stock" && value === "RECEIVED"
                      ? "Clôturé"
                      : (labels[value] ?? value),
                })),
              ]
            : undefined
        }
      />
      {can && (
        <Button title={creationTitles[kind]} onPress={() => setCreate(true)} />
      )}
      {!r.data ? (
        <LoadState error={r.error} retry={r.reload} />
      ) : (
        <>
          <Card>
            {r.data.items.map((p) => (
              <ListRow
                key={p.id}
                title={p.reference}
                description={`${p.shop?.name ?? p.stock?.shop.name ?? ""}${p.agency?.name ? " · " + p.agency.name : ""}${p.originAgency?.name ? " · " + p.originAgency.name + " → " + p.destinationAgency?.name : ""}\n${date(p.createdAt)}`}
                icon={
                  kind === "transferts-stock"
                    ? "truck"
                    : kind === "inventaires"
                      ? "clipboard"
                      : "archive"
                }
                trailing={
                  <Badge
                    success={["RECEIVED", "CONFIRMED", "APPROVED"].includes(
                      p.status,
                    )}
                  >
                    {kind === "sorties"
                      ? "Sortie validée"
                      : kind === "transferts-stock" && p.status === "RECEIVED"
                        ? "Clôturé"
                        : (labels[p.status] ?? p.status)}
                  </Badge>
                }
                onPress={() => setSelected(p.id)}
              />
            ))}
            {!r.data.items.length && (
              <EmptyState
                title="Aucune opération à afficher"
                description="Les opérations enregistrées dans votre périmètre apparaîtront ici."
                icon="archive"
              />
            )}
            <Button secondary title="Actualiser" onPress={r.reload} />
          </Card>
          <Pager page={page} total={r.data.total} setPage={setPage} />
        </>
      )}
      {create && (
        <OperationForm
          kind={kind}
          context={context}
          options={options.data}
          onClose={() => setCreate(false)}
          onCreated={(id) => {
            setCreate(false);
            setSelected(id);
            r.reload();
          }}
        />
      )}
    </>
  );
}
export function StocksScreen({
  moduleId,
  context,
}: {
  moduleId: string;
  context: Workspace;
}) {
  return (
    <View style={{ gap: 18 }}>
      <Text style={ui.kicker}>
        {context.shopName ?? context.agencyName ?? context.companyName}
      </Text>
      {moduleId === "produits" ? (
        <CatalogScreen context={context} />
      ) : moduleId === "mouvements" ? (
        <Movements context={context} />
      ) : Object.hasOwn(paths, moduleId) ? (
        <Operations kind={moduleId as OperationKind} context={context} />
      ) : (
        <Balances context={context} alerts={moduleId === "alertes-stock"} />
      )}
    </View>
  );
}
