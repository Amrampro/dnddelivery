import {
  canWrite,
  stockQuery,
  quantity,
  stockDate,
  type StockFilters,
} from "./stockLogic";
import { StockFilterBar } from "./StockFilters";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../auth/client";
import type { Workspace } from "../auth/types";
import { useResource } from "../admin/useResource";
import { ConfirmAction, type AdminAction } from "../admin/ConfirmAction";
import { Button, Card, DataTable, EmptyState, Field } from "../design/ui";
import {
  StockBadge,
  StockFeedback,
  StockPager,
  StockResource,
  type Page,
} from "./StockComponents";
import { ProductCatalogue } from "./ProductCatalogue";
import { StockOperations } from "./StockOperations";
import type {
  StockBalance,
  StockMovement,
  StockOptions,
  StockSummary,
} from "./types";
import "../admin/admin.css";
import "./stocks.css";

function Metrics({ summary }: { summary: StockSummary }) {
  return (
    <div className="stock-metrics">
      {[
        ["Unités physiques", summary.physicalQuantity],
        ["Unités réservées", summary.reservedQuantity],
        ["Unités disponibles", summary.availableQuantity],
        ["Unités en transit", summary.inTransitQuantity],
        ["Stocks faibles", summary.lowStockCount],
        ["Transferts en cours", summary.transferCount],
        ["Écarts d’inventaire", summary.inventoryVarianceCount],
      ].map(([label, value]) => (
        <Card key={label} className="stock-metric">
          <small>{label}</small>
          <strong>{quantity(value)}</strong>
        </Card>
      ))}
    </div>
  );
}
function Balances({
  context,
  options,
  filters,
  change,
  alerts = false,
}: {
  context: Workspace;
  options: StockOptions;
  filters: StockFilters;
  change: (f: StockFilters) => void;
  alerts?: boolean;
}) {
  const query = stockQuery({ ...filters, low: alerts || filters.low }),
    r = useResource<Page<StockBalance>>(
      `${alerts ? "/stocks/alerts" : "/stocks"}?${query}`,
    ),
    summary = useResource<StockSummary>(`/stocks/summary?${query}`),
    base = `/portail/${context.portal}`;
  return (
    <>
      <div className="stock-heading">
        <div>
          <span className="eyebrow">MARCHANDISES EN CONSERVATION</span>
          <h1>
            {alerts
              ? "Alertes de stock"
              : context.scope === "SHOP"
                ? "Mes stocks chez les agences de livraison"
                : "Vue des stocks"}
          </h1>
          <p>
            Disponible = physique − réservé. Les marchandises en transit restent
            comptées séparément.
          </p>
        </div>
        {canWrite(context, "stocks.deposit") && (
          <Link className="ds-button ds-primary" to={`${base}/depots/nouveau`}>
            Enregistrer un dépôt
          </Link>
        )}
      </div>
      <StockFilterBar
        context={context}
        options={options}
        filters={filters}
        change={change}
        stock
      />
      {summary.data && <Metrics summary={summary.data} />}
      {summary.error && <StockFeedback error={summary.error} />}
      <StockResource {...r}>
        {r.data && (
          <>
            {r.data.items.length ? (
              <DataTable
                caption={
                  alerts ? "Produits sous leur seuil" : "Soldes de stock"
                }
                columns={[
                  "Produit / SKU",
                  "Boutique",
                  "Entreprise / agence",
                  "Physique",
                  "Réservé",
                  "Disponible",
                  "Transit",
                  "Seuil",
                  "",
                ]}
                rows={r.data.items.map((s) => [
                  <div className="admin-company-name">
                    {s.product.name}
                    <small>
                      {s.product.sku ?? "Sans SKU"} · {s.product.unit}
                    </small>
                  </div>,
                  s.shop.name,
                  <div>
                    {s.company.name}
                    <small className="admin-block">{s.agency.name}</small>
                  </div>,
                  quantity(s.physicalQuantity),
                  quantity(s.reservedQuantity),
                  <div>
                    {quantity(s.availableQuantity)}
                    {s.availableQuantity === 0 ? (
                      <StockBadge value="OUT_OF_STOCK" />
                    ) : s.availableQuantity <= s.alertThreshold ? (
                      <StockBadge value="LOW" />
                    ) : null}
                  </div>,
                  quantity(s.inTransitQuantity),
                  quantity(s.alertThreshold),
                  <Link to={`${base}/stocks/${s.id}`}>Détails</Link>,
                ])}
              />
            ) : (
              <EmptyState
                title={
                  alerts
                    ? "Aucune alerte dans ce périmètre."
                    : "Aucun stock dans cette sélection."
                }
                description={
                  alerts
                    ? "Les alertes suivent les soldes réellement enregistrés."
                    : "Un dépôt confirmé fera apparaître les marchandises réceptionnées."
                }
              />
            )}
            <StockPager
              page={filters.page}
              total={r.data.total}
              size={r.data.size}
              change={(p) => change({ ...filters, page: p })}
            />
          </>
        )}
      </StockResource>
    </>
  );
}
function StockDetail({ id, context }: { id: string; context: Workspace }) {
  const r = useResource<StockBalance>(`/stocks/${id}`),
    [action, setAction] = useState<AdminAction | null>(null),
    [threshold, setThreshold] = useState(""),
    [notice, setNotice] = useState("");
  return (
    <>
      <Link className="stock-back" to={`/portail/${context.portal}/stocks`}>
        ← Stocks
      </Link>
      <h1>Détail du stock</h1>
      <StockFeedback notice={notice} />
      <StockResource {...r}>
        {r.data && (
          <Card title={r.data.product.name}>
            <dl className="stock-details">
              {[
                ["Boutique propriétaire", r.data.shop.name],
                ["Entreprise de conservation", r.data.company.name],
                ["Agence", r.data.agency.name],
                ["SKU", r.data.product.sku],
                ["Physique", quantity(r.data.physicalQuantity)],
                ["Réservé", quantity(r.data.reservedQuantity)],
                ["Disponible", quantity(r.data.availableQuantity)],
                ["En transit", quantity(r.data.inTransitQuantity)],
                ["Seuil d’alerte", quantity(r.data.alertThreshold)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v || "—"}</dd>
                </div>
              ))}
            </dl>
            {canWrite(context, "stocks.threshold") && (
              <div className="admin-toolbar">
                <Field
                  label="Nouveau seuil d’alerte"
                  type="number"
                  min={0}
                  step={1}
                  placeholder={String(r.data.alertThreshold)}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                />
                <Button
                  disabled={
                    threshold === "" ||
                    !Number.isSafeInteger(Number(threshold)) ||
                    Number(threshold) < 0
                  }
                  onClick={() => {
                    const s = r.data!;
                    setAction({
                      title: "Modifier le seuil d’alerte ?",
                      description:
                        "Le seuil est propre à ce produit, cette boutique et cette agence. Aucune quantité physique ne change.",
                      submit: () =>
                        api(`/stocks/${id}/threshold`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            version: s.version,
                            alertThreshold: Number(threshold),
                          }),
                        }),
                    });
                  }}
                >
                  Enregistrer le seuil
                </Button>
              </div>
            )}
            <div className="ds-actions">
              <Link
                to={`/portail/${context.portal}/mouvements?productId=${r.data.productId}&agencyId=${r.data.agencyId}&shopId=${r.data.shopId}`}
              >
                Voir les mouvements de ce produit
              </Link>
            </div>
          </Card>
        )}
      </StockResource>
      {action && (
        <ConfirmAction
          action={action}
          close={() => setAction(null)}
          done={(m) => {
            setNotice(m);
            setThreshold("");
            r.reload();
          }}
        />
      )}
    </>
  );
}
function Movements({
  context,
  options,
  filters,
  change,
}: {
  context: Workspace;
  options: StockOptions;
  filters: StockFilters;
  change: (f: StockFilters) => void;
}) {
  const r = useResource<Page<StockMovement>>(
    `/stocks/movements?${stockQuery({ ...filters, status: "" })}`,
  );
  return (
    <>
      <h1>Journal des mouvements</h1>
      <p>
        Chaque mouvement conserve les variations physiques et réservées, les
        soldes et sa référence d’opération.
      </p>
      <StockFilterBar
        context={context}
        options={options}
        filters={filters}
        change={change}
      />
      <StockResource {...r}>
        {r.data && (
          <>
            {r.data.items.length ? (
              <DataTable
                caption="Mouvements immuables de marchandises"
                columns={[
                  "Date / référence",
                  "Mouvement",
                  "Produit / boutique",
                  "Entreprise / agence",
                  "Variation physique",
                  "Variation réservée",
                  "Soldes avant → après",
                  "Auteur / motif",
                ]}
                rows={r.data.items.map((m) => [
                  <div>
                    {stockDate(m.createdAt)}
                    <small className="admin-block">
                      {m.operationReference ?? m.reference ?? m.operationKey}
                    </small>
                  </div>,
                  <StockBadge value={m.type} />,
                  <div>
                    {m.stock.product.name}
                    <small className="admin-block">{m.stock.shop.name}</small>
                  </div>,
                  <div>
                    {m.stock.company.name}
                    <small className="admin-block">{m.stock.agency.name}</small>
                  </div>,
                  `${m.physicalDelta > 0 ? "+" : ""}${quantity(m.physicalDelta)}`,
                  `${m.reservedDelta > 0 ? "+" : ""}${quantity(m.reservedDelta)}`,
                  <div>
                    Physique{" "}
                    {quantity(
                      m.physicalBefore ?? m.physicalAfter - m.physicalDelta,
                    )}{" "}
                    → {quantity(m.physicalAfter)}
                    <small className="admin-block">
                      Réservé{" "}
                      {quantity(
                        m.reservedBefore ?? m.reservedAfter - m.reservedDelta,
                      )}{" "}
                      → {quantity(m.reservedAfter)}
                    </small>
                  </div>,
                  <div>
                    {m.actor?.fullName ?? "—"}
                    <small className="admin-block">{m.notes ?? "—"}</small>
                  </div>,
                ])}
              />
            ) : (
              <EmptyState
                title="Aucun mouvement dans cette sélection."
                description="Les opérations validées créeront leur trace dans ce journal."
              />
            )}
            <StockPager
              page={filters.page}
              total={r.data.total}
              size={r.data.size}
              change={(p) => change({ ...filters, page: p })}
            />
          </>
        )}
      </StockResource>
    </>
  );
}
export function StockWorkspace({
  context,
  moduleId,
}: {
  context: Workspace;
  moduleId: string;
}) {
  const { entityId } = useParams();
  if (moduleId === "produits")
    return <ProductCatalogue context={context} id={entityId} />;
  return <StockModule context={context} moduleId={moduleId} />;
}
function StockModule({
  context,
  moduleId,
}: {
  context: Workspace;
  moduleId: string;
}) {
  const { entityId } = useParams(),
    [search] = useSearchParams(),
    [filters, setFilters] = useState<StockFilters>({
      q: "",
      companyId: "",
      agencyId: context.agencyId ?? search.get("agencyId") ?? "",
      shopId: search.get("shopId") ?? "",
      productId: search.get("productId") ?? "",
      status: "",
      low: false,
      page: 1,
    }),
    options = useResource<StockOptions>("/stocks/options");
  return (
    <StockResource {...options}>
      {options.data &&
        (["stocks", "alertes-stock"].includes(moduleId) ? (
          entityId ? (
            <StockDetail context={context} id={entityId} />
          ) : (
            <Balances
              context={context}
              options={options.data}
              filters={filters}
              change={setFilters}
              alerts={moduleId === "alertes-stock"}
            />
          )
        ) : moduleId === "mouvements" ? (
          <Movements
            context={context}
            options={options.data}
            filters={filters}
            change={setFilters}
          />
        ) : (
          <StockOperations
            context={context}
            moduleId={moduleId}
            id={entityId}
            options={options.data}
            filters={filters}
            change={setFilters}
          />
        ))}
    </StockResource>
  );
}
