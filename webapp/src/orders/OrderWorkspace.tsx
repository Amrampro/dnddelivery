import { useState, useRef } from "react";
import { useResource } from "../admin/useResource";
import { api } from "../auth/client";
import type { Workspace } from "../auth/types";
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
  Dialog,
} from "../design/ui";
import { OrderForm } from "./OrderForm";
import { OrderDeliveryProgress } from "../deliveries/DeliveryWorkspace";
import {OrderFinanceSummary} from "../finance/FinanceWorkspace";
import { deliveryEvents } from "../../../shared/deliveries";
import {
  orderCan,
  orderStatus,
  orderEventLabel,
  orderChanges,
  type OrderDTO,
  type OrderPage,
  type OrderOptions,
  type OrderEvent,
} from "../../../shared/orders";
import "../stocks/stocks.css";
import "./orders.css";
const date = (s: string) => new Date(s).toLocaleString("fr-FR");
export function OrderWorkspace({
  context,
  moduleId,
}: {
  context: Workspace;
  moduleId: string;
}) {
  const [mode, setMode] = useState<"list" | "form" | "detail">(
      moduleId === "nouvelle-commande" ? "form" : "list",
    ),
    [selected, setSelected] = useState<OrderDTO>(),
    [page, setPage] = useState(1),
    [filter, setFilter] = useState<Record<string, string>>({
      draft: moduleId === "brouillons" ? "true" : "false",
    }),
    [query, setQuery] = useState(""),
    [reason, setReason] = useState(""),
    [cancel, setCancel] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    options = useResource<OrderOptions>("/orders/options"),
    list = useResource<OrderPage<OrderDTO>>(
      `/orders?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filter).filter(([, v]) => v)), q: query, page: String(page) })}`,
    ),
    detail = useResource<OrderDTO>(selected ? `/orders/${selected.id}` : null),
    history = useResource<OrderEvent[]>(
      selected ? `/orders/${selected.id}/history` : null,
    );
  const p = detail.data ?? selected;
  const change = (key: string, value: string) => {
    setPage(1);
    setFilter((f) => ({ ...f, [key]: value }));
  };
  const open = (row: OrderDTO) => {
    setSelected(row);
    setMode("detail");
    setError("");
    detail.reload();
    history.reload();
  };
  async function action(kind: "submit" | "cancel") {
    if (!p || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const updated = await api<OrderDTO>(`/orders/${p.id}/${kind}`, {
        method: "POST",
        body: JSON.stringify({
          version: p.version,
          ...(kind === "cancel" ? { reason } : {}),
        }),
      });
      setSelected(updated);
      setCancel(false);
      detail.reload();
      history.reload();
      list.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (mode === "form")
    return options.data ? (
      <OrderForm
        context={context}
        options={options.data}
        initial={selected}
        onBack={() => setMode("list")}
        onDone={(row) => {
          open(row);
          list.reload();
        }}
      />
    ) : options.error ? (
      <ErrorState message={options.error} retry={options.reload} />
    ) : (
      <Skeleton />
    );
  if (mode === "detail" && p)
    return (
      <>
        <div className="stock-heading">
          <div>
            <span className="eyebrow">COMMANDE · {p.company.name}</span>
            <h1 className="order-reference">{p.publicNumber}</h1>
            <Badge>
              {p.isDraft && p.status !== "CANCELLED"
                ? "Brouillon"
                : (orderStatus[p.status] ?? p.status)}
            </Badge>
            <p>
              {p.collaboration.shop.name} · {p.agency.name} ·{" "}
              {date(p.createdAt)}
            </p>
          </div>
          <Button variant="ghost" onClick={() => setMode("list")}>
            Retour aux commandes
          </Button>
        </div>
        {!!error && <ErrorState message={error} />}
        <div className="order-grid">
          <Card>
            <h2>Destinataire</h2>
            <p>
              <strong>{p.recipientName}</strong>
            </p>
            <p>{p.recipientEmail}</p>
            <p>{p.recipientPhone}</p>
            <p>
              {p.recipientAddress}, {p.recipientCity}, {p.recipientCountry}
            </p>
            {p.recipientDetails &&
              Object.entries(p.recipientDetails)
                .filter(
                  ([k, v]) =>
                    v !== undefined &&
                    ![
                      "name",
                      "email",
                      "phone",
                      "address",
                      "city",
                      "country",
                    ].includes(k),
                )
                .map(([k, v]) => (
                  <p key={k}>
                    {(
                      {
                        district: "Quartier",
                        landmark: "Repère",
                        accessInstructions: "Accès",
                        desiredDeliveryAt: "Date souhaitée",
                        observations: "Observations",
                        latitude: "Latitude",
                        longitude: "Longitude",
                      } as Record<string, string>
                    )[k] ?? k}{" "}
                    : {String(v)}
                  </p>
                ))}
          </Card>
          <Card>
            <h2>Prise en charge</h2>
            <p>
              {p.type === "ONE_OFF"
                ? "Commande ponctuelle"
                : "Commande depuis stock"}
            </p>
            <p>{p.parcelDescription}</p>
            {p.pickup && (
              <p>
                {p.pickup.address} · {p.pickup.contact} · {p.pickup.phone}
                <br />
                {p.pickup.instructions}
              </p>
            )}
            <p>Créée par {p.creator.fullName}</p>
            <h3>Encaissement attendu</h3>
            <p>
              {p.collectionRequired
                ? `${p.amountToCollect} ${p.currency}`
                : "Aucun · 0"}
            </p>
            <p>{p.financialNotes}</p>
            <p>{p.notes}</p>
            {p.cancellationReason && <p>Annulation : {p.cancellationReason}</p>}
          </Card>
        </div>
        <Card>
          <h2>Articles et réservations</h2>
          <DataTable
            caption="Articles de la commande"
            columns={["Article", "Quantité", "Valeur déclarée", "Réservations"]}
            rows={p.orderItem_orderRecords.map((i) => [
              <div>
                {i.name}
                <small className="admin-block">
                  {i.sku} · {i.description} · {i.instructions}
                </small>
              </div>,
              i.quantity,
              i.declaredValue ?? "—",
              i.stockReservation_orderItemRecords.length
                ? i.stockReservation_orderItemRecords.map((r) => (
                    <p key={r.id}>
                      {r.quantity} ·{" "}
                      {r.status === "ACTIVE"
                        ? "Réservée"
                        : r.status === "RELEASED"
                          ? "Libérée"
                          : "Consommée"}
                    </p>
                  ))
                : "Aucune",
            ])}
          />
        </Card>
        <div className="order-actions">
          {p.status === "PENDING" && orderCan(context, "edit") && (
            <Button
              variant="secondary"
              onClick={() => {
                setSelected(p);
                setMode("form");
              }}
            >
              Modifier la commande
            </Button>
          )}
          {p.isDraft &&
            p.status === "PENDING" &&
            orderCan(context, "create") && (
              <Button busy={busy} onClick={() => action("submit")}>
                Soumettre le brouillon
              </Button>
            )}
          {p.status === "PENDING" && orderCan(context, "cancel") && (
            <Button
              variant="danger"
              onClick={() => {
                setCancel(true);
                setReason("");
              }}
            >
              Annuler la commande
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              detail.reload();
              history.reload();
            }}
          >
            Actualiser
          </Button>
        </div>
        {context.permissions.some((code) =>
          [
            "shop.deliveries.read",
            "deliveries.supervise.read",
            "deliveries.self.read",
          ].includes(code),
        ) && <OrderDeliveryProgress orderId={p.id} context={context} />}
        {context.permissions.some(code=>["financial.supervise.read","collections.self.read","shop.collections.read"].includes(code))&&<OrderFinanceSummary orderId={p.id} context={context}/>}
        <Card>
          <h2>Historique conservé</h2>
          {history.error && (
            <ErrorState message={history.error} retry={history.reload} />
          )}
          <ol className="order-history">
            {history.data?.map((e) => (
              <li key={e.id}>
                <strong>
                  {orderEventLabel[e.action] ??
                    deliveryEvents[e.action.replace(/^DELIVERY_/, "")] ??
                    e.action}
                </strong>
                <span>
                  {date(e.createdAt)} · {e.actor.fullName}
                </span>
                {e.previousStatus && e.previousStatus !== e.status && (
                  <p>
                    {orderStatus[e.previousStatus]} → {orderStatus[e.status]}
                  </p>
                )}
                {!!e.metadata?.reason && <p>{String(e.metadata.reason)}</p>}
                {e.action === "UPDATED" && (
                  <details>
                    <summary>Détail des modifications</summary>
                    {orderChanges(e.metadata).map((line, index) => (
                      <p key={index}>{line}</p>
                    ))}
                  </details>
                )}
              </li>
            ))}
          </ol>
        </Card>
        <Dialog
          open={cancel}
          onClose={() => {
            if (!busy) setCancel(false);
          }}
          title="Confirmer l’annulation"
        >
          <p>
            La commande restera dans l’historique. Ses réservations actives
            seront libérées.
          </p>
          <Field
            label="Motif d’annulation"
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
          />
          {!!error && <ErrorState message={error} />}
          <Button
            variant="danger"
            disabled={!reason.trim()}
            busy={busy}
            onClick={() => action("cancel")}
          >
            Confirmer l’annulation
          </Button>
        </Dialog>
      </>
    );
  return (
    <>
      <div className="stock-heading">
        <div>
          <span className="eyebrow">DEMANDES DE LIVRAISON</span>
          <h1>
            {context.scope === "SHOP" ? "Mes commandes" : "Commandes reçues"}
          </h1>
          <p>Commandes, brouillons et réservations de votre périmètre.</p>
        </div>
        {orderCan(context, "create") && (
          <Button
            onClick={() => {
              setSelected(undefined);
              setMode("form");
            }}
          >
            Nouvelle commande
          </Button>
        )}
      </div>
      {list.data?.summary && (
        <div className="stock-metrics">
          {[
            ["En attente", list.data.summary.pending],
            ["Brouillons", list.data.summary.drafts],
            ["Annulées", list.data.summary.cancelled],
          ].map(([label, value]) => (
            <Card key={label}>
              <small>{label}</small>
              <h2>{value}</h2>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <div className="order-grid">
          <Field
            label="Référence ou destinataire"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          <Select
            label="Demandes"
            value={filter.draft}
            onChange={(e) => change("draft", e.target.value)}
          >
            <option value="false">Soumises</option>
            <option value="true">Brouillons</option>
            <option value="">Toutes</option>
          </Select>
          <Select
            label="Statut"
            value={filter.status ?? ""}
            onChange={(e) => change("status", e.target.value)}
          >
            <option value="">Tous les statuts</option>
            {Object.entries(orderStatus).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            label="Type"
            value={filter.type ?? ""}
            onChange={(e) => change("type", e.target.value)}
          >
            <option value="">Tous</option>
            <option value="ONE_OFF">Ponctuelle</option>
            <option value="FROM_STOCK">Depuis stock</option>
          </Select>
          <Select
            label="Agence de livraison"
            value={filter.companyId ?? ""}
            onChange={(e) => {
              change("companyId", e.target.value);
              change("agencyId", "");
            }}
          >
            <option value="">Tous ceux du contexte</option>
            {options.data &&
              Array.from(
                new Map(
                  options.data.pairs.map((p) => [p.companyId, p.company]),
                ).values(),
              ).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
          <Select
            label="Boutique"
            value={filter.shopId ?? ""}
            onChange={(e) => change("shopId", e.target.value)}
          >
            <option value="">Toutes celles du contexte</option>
            {options.data &&
              Array.from(
                new Map(
                  options.data.pairs.map((p) => [p.shopId, p.shop]),
                ).values(),
              ).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
          <Select
            label="Agence"
            value={filter.agencyId ?? ""}
            onChange={(e) => change("agencyId", e.target.value)}
          >
            <option value="">Toutes celles du contexte</option>
            {options.data?.agencies
              .filter(
                (a) => !filter.companyId || a.companyId === filter.companyId,
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
          <Select
            label="Encaissement requis"
            value={filter.collectionRequired ?? ""}
            onChange={(e) => change("collectionRequired", e.target.value)}
          >
            <option value="">Tous</option>
            <option value="true">Oui</option>
            <option value="false">Non</option>
          </Select>
          <Field
            label="Du"
            type="date"
            value={filter.from ?? ""}
            onChange={(e) => change("from", e.target.value)}
          />
          <Field
            label="Au"
            type="date"
            value={filter.to ?? ""}
            onChange={(e) => change("to", e.target.value)}
          />
          <Select
            label="Tri"
            value={filter.sort ?? "newest"}
            onChange={(e) => change("sort", e.target.value)}
          >
            <option value="newest">Plus récentes</option>
            <option value="oldest">Plus anciennes</option>
          </Select>
        </div>
      </Card>
      {list.error ? (
        <ErrorState message={list.error} retry={list.reload} />
      ) : !list.data ? (
        <Skeleton />
      ) : list.data.items.length ? (
        <Card>
          <DataTable
            caption="Commandes autorisées"
            columns={[
              "Référence",
              "Boutique / agence",
              "Destinataire",
              "Type",
              "Statut",
              "Encaissement",
              "Création",
              "",
            ]}
            rows={list.data.items.map((p) => [
              <strong className="order-reference">{p.publicNumber}</strong>,
              <div>
                {p.collaboration.shop.name}
                <small className="admin-block">
                  {p.company.name} · {p.agency.name}
                </small>
              </div>,
              <div>
                {p.recipientName}
                <small className="admin-block">{p.recipientCity}</small>
              </div>,
              p.type === "FROM_STOCK" ? "Depuis stock" : "Ponctuelle",
              <Badge>
                {p.isDraft && p.status !== "CANCELLED"
                  ? "Brouillon"
                  : orderStatus[p.status]}
              </Badge>,
              p.collectionRequired
                ? `${p.amountToCollect} ${p.currency}`
                : "Aucun",
              date(p.createdAt),
              <Button variant="ghost" onClick={() => open(p)}>
                Consulter
              </Button>,
            ])}
          />
        </Card>
      ) : (
        <EmptyState
          title="Aucune commande"
          description="Aucune commande ne correspond aux filtres actuels."
        />
      )}
      <div className="order-actions">
        <Button
          variant="secondary"
          disabled={page === 1}
          onClick={() => setPage((n) => n - 1)}
        >
          Précédent
        </Button>
        <span>
          Page {page} · {list.data?.total ?? 0} commande(s)
        </span>
        <Button
          variant="secondary"
          disabled={page * 20 >= (list.data?.total ?? 0)}
          onClick={() => setPage((n) => n + 1)}
        >
          Suivant
        </Button>
        <Button variant="ghost" onClick={list.reload}>
          Actualiser
        </Button>
      </div>
    </>
  );
}
