import { StockFilterBar } from "./StockFilters";
import { quantity, stockDate } from "./stockLogic";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../auth/client";
import type { Workspace } from "../auth/types";
import { useResource } from "../admin/useResource";
import { ConfirmAction, type AdminAction } from "../admin/ConfirmAction";
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Select,
  Textarea,
} from "../design/ui";
import {
  StockBadge,
  StockFeedback,
  StockLines,
  StockPager,
  StockPicker,
  StockResource,
  type ItemLine,
  type Page,
} from "./StockComponents";
import { canWrite, stockQuery, type StockFilters } from "./stockLogic";
import type {
  OperationItem,
  StockBalance,
  StockOperation,
  StockOptions,
  TransferIncident,
} from "./types";
type OperationKind =
  "depots" | "sorties" | "reservations" | "transferts-stock" | "inventaires";
const configs: Record<
  OperationKind,
  {
    title: string;
    singular: string;
    endpoint: string;
    permission: string;
    create: string;
  }
> = {
  depots: {
    title: "Dépôts de marchandises",
    singular: "Dépôt",
    endpoint: "/stock-deposits",
    permission: "stocks.deposit",
    create: "Enregistrer un dépôt",
  },
  sorties: {
    title: "Sorties manuelles",
    singular: "Sortie",
    endpoint: "/stock-withdrawals",
    permission: "stocks.withdraw",
    create: "Enregistrer une sortie",
  },
  reservations: {
    title: "Réservations de stock",
    singular: "Réservation",
    endpoint: "/stock-reservations",
    permission: "stocks.reserve",
    create: "Réserver des unités",
  },
  "transferts-stock": {
    title: "Transferts entre agences",
    singular: "Transfert",
    endpoint: "/stock-transfers",
    permission: "stocks.transfer",
    create: "Préparer un transfert",
  },
  inventaires: {
    title: "Inventaires physiques",
    singular: "Inventaire",
    endpoint: "/inventories",
    permission: "stocks.inventory",
    create: "Créer un inventaire",
  },
};
function freeTransit(operation: StockOperation, item: OperationItem) {
  const total =
    item.inTransitQuantity ??
    item.quantity -
      (item.receivedQuantity ?? 0) -
      (item.lostQuantity ?? 0) -
      (item.returnedQuantity ?? 0);
  const held = (operation.incidents ?? [])
    .filter((i) => i.itemId === item.id && i.status === "OPEN")
    .reduce((sum, i) => sum + i.quantity, 0);
  return Math.max(0, total - held);
}
function validItems(items: ItemLine[]) {
  return (
    items.length > 0 &&
    items.every((i) => Number.isSafeInteger(i.quantity) && i.quantity > 0)
  );
}
function operationShop(o: StockOperation, options: StockOptions) {
  const ids = [
    ...new Set((o.items ?? []).map((i) => i.shopId).filter(Boolean)),
  ];
  return (
    o.shop?.name ??
    o.stock?.shop.name ??
    options.shops.find(
      (s) => s.id === (o.shopId ?? (ids.length === 1 ? ids[0] : undefined)),
    )?.name ??
    "Plusieurs boutiques"
  );
}
function OptionSelect({
  label,
  value,
  change,
  items,
  required = true,
  disabled = false,
}: {
  label: string;
  value: string;
  change: (v: string) => void;
  items: { id: string; name: string }[];
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <Select
      label={label}
      value={value}
      required={required}
      disabled={disabled}
      onChange={(e) => change(e.target.value)}
    >
      <option value="">{required ? "Choisir…" : "Toutes les boutiques"}</option>
      {items.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name}
        </option>
      ))}
    </Select>
  );
}
function NewOperation({
  kind,
  context,
  options,
}: {
  kind: OperationKind;
  context: Workspace;
  options: StockOptions;
}) {
  const config = configs[kind],
    navigate = useNavigate(),
    [agencyId, setAgencyId] = useState(context.agencyId ?? ""),
    [shopId, setShopId] = useState(""),
    [destination, setDestination] = useState(""),
    [items, setItems] = useState<ItemLine[]>([]),
    [stockId, setStockId] = useState(""),
    [selectedStock, setSelectedStock] = useState<StockBalance>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [action, setAction] = useState<AdminAction | null>(null);
  const base = `/portail/${context.portal}/${kind}`;
  async function save(body: object) {
    const created = await api<StockOperation>(config.endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (kind === "sorties" || kind === "reservations") navigate(base);
    else navigate(`${base}/${created.id}`);
    return created;
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      reference = String(f.get("reference")),
      notes = String(f.get("notes")) || undefined;
    setError("");
    let body: object;
    if (["depots", "transferts-stock"].includes(kind)) {
      if (!validItems(items)) {
        setError(
          "Ajoutez au moins un produit avec une quantité entière positive.",
        );
        return;
      }
      body = {
        reference,
        shopId,
        ...(kind === "depots"
          ? { agencyId }
          : { originAgencyId: agencyId, destinationAgencyId: destination }),
        items: items.map(({ productId, quantity }) => ({
          productId,
          quantity,
        })),
        ...(notes ? { notes } : {}),
      };
    } else if (kind === "inventaires") {
      body = {
        reference,
        agencyId,
        ...(shopId ? { shopId } : {}),
        ...(notes ? { notes } : {}),
      };
    } else {
      const count = Number(f.get("quantity"));
      if (!Number.isSafeInteger(count) || count < 1) {
        setError("La quantité doit être un entier positif.");
        return;
      }
      body = {
        reference,
        stockId,
        quantity: count,
        ...(kind === "sorties"
          ? {
              kind: String(f.get("kind")),
              reason: String(f.get("reason")),
              ...(f.get("recipient")
                ? { recipient: String(f.get("recipient")) }
                : {}),
            }
          : notes
            ? { notes }
            : {}),
      };
    }
    if (kind === "sorties") {
      setAction({
        title: "Confirmer la sortie physique ?",
        description:
          "Les unités seront retirées du stock physique. Les unités déjà réservées ne peuvent pas être retirées par cette opération.",
        submit: () => save(body),
      });
      return;
    }
    setBusy(true);
    try {
      await save(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="stock-back" to={base}>
        ← {config.title}
      </Link>
      <h1>{config.create}</h1>
      <Card>
        <form className="stock-form" onSubmit={submit}>
          <Field
            label="Référence de l’opération"
            name="reference"
            required
            minLength={2}
            maxLength={60}
          />
          <div className="stock-form-grid">
            <OptionSelect
              label={
                kind === "transferts-stock" ? "Agence d’origine" : "Agence"
              }
              value={agencyId}
              change={(v) => {
                setAgencyId(v);
                setStockId("");
                setItems([]);
              }}
              items={options.agencies}
              disabled={context.scope === "AGENCY"}
            />
            {kind === "transferts-stock" && (
              <OptionSelect
                label="Agence de destination"
                value={destination}
                change={setDestination}
                items={(options.destinationAgencies ?? options.agencies).filter(
                  (a) => a.id !== agencyId,
                )}
              />
            )}
            <OptionSelect
              label="Boutique propriétaire"
              value={shopId}
              change={(v) => {
                setShopId(v);
                setItems([]);
                setStockId("");
              }}
              items={options.shops}
              required={kind !== "inventaires"}
            />
          </div>
          <p className="stock-info">
            Les nouveaux dépôts, réservations et transferts nécessitent une
            collaboration active et une agence explicitement partagée par
            l’entreprise.{" "}
            {context.scope === "COMPANY" &&
            context.permissions.includes("partners.manage") ? (
              <Link to="/portail/entreprise/partenaires">
                Gérer les agences des partenaires
              </Link>
            ) : (
              "Si l’agence n’est pas autorisée, demandez sa configuration à l’administrateur de l’entreprise."
            )}
          </p>
          {["depots", "transferts-stock"].includes(kind) &&
            (shopId && agencyId ? (
              <StockLines
                endpoint={
                  kind === "depots"
                    ? `/products?shopId=${shopId}&status=ACTIVE`
                    : `/stocks?agencyId=${agencyId}&shopId=${shopId}`
                }
                items={items}
                change={setItems}
                stock={kind === "transferts-stock"}
              />
            ) : (
              <p className="stock-info">
                Sélectionnez une agence et une boutique pour rechercher leurs
                produits.
              </p>
            ))}
          {["sorties", "reservations"].includes(kind) && (
            <>
              {agencyId && shopId ? (
                <StockPicker
                  endpoint={`/stocks?agencyId=${agencyId}&shopId=${shopId}`}
                  label="Produit et solde de stock"
                  value={stockId}
                  required
                  initial={selectedStock}
                  change={(id, s) => {
                    setStockId(id);
                    setSelectedStock(s as StockBalance | undefined);
                  }}
                />
              ) : (
                <p>
                  Choisissez l’agence et la boutique pour sélectionner un stock.
                </p>
              )}
              {selectedStock && (
                <p className="stock-info">
                  Physique : {quantity(selectedStock.physicalQuantity)} ·
                  Réservé : {quantity(selectedStock.reservedQuantity)} ·
                  Disponible : {quantity(selectedStock.availableQuantity)}
                </p>
              )}
              <Field
                name="quantity"
                label="Quantité entière"
                type="number"
                min={1}
                step={1}
                max={selectedStock?.availableQuantity}
                required
              />
            </>
          )}
          {kind === "sorties" ? (
            <>
              <Select label="Nature de la sortie" name="kind">
                <option value="RETURN">Restitution à la boutique</option>
                <option value="WITHDRAWAL">Retrait autorisé</option>
              </Select>
              <Textarea
                label="Motif de la sortie"
                name="reason"
                required
                minLength={3}
                maxLength={500}
              />
              <Field
                label="Destinataire du retrait"
                name="recipient"
                maxLength={160}
              />
            </>
          ) : (
            <Textarea
              label="Observation facultative"
              name="notes"
              maxLength={1000}
            />
          )}
          <p className="stock-info">
            {kind === "depots"
              ? "Le dépôt reste en brouillon. Seule sa réception confirmée ajoutera les unités au stock physique."
              : kind === "transferts-stock"
                ? "Le brouillon ne déplace aucune marchandise. Le départ confirmé sortira les unités de l’agence d’origine et les placera en transit."
                : kind === "reservations"
                  ? "Une réservation réduit le disponible sans modifier le stock physique. Sa consommation exige ensuite une sortie physique explicitement confirmée."
                  : kind === "inventaires"
                    ? "L’inventaire conserve une photographie du stock théorique. Les comptages n’ajusteront les soldes qu’après validation autorisée."
                    : "Une sortie ne peut pas retirer les quantités déjà réservées."}
          </p>
          <StockFeedback error={error} />
          <Button
            busy={busy}
            type="submit"
            disabled={
              (kind === "transferts-stock" &&
                (!destination || destination === agencyId)) ||
              (["sorties", "reservations"].includes(kind) && !stockId) ||
              (["depots", "transferts-stock"].includes(kind) &&
                !validItems(items))
            }
          >
            {kind === "depots" || kind === "transferts-stock"
              ? "Enregistrer le brouillon"
              : config.create}
          </Button>
        </form>
      </Card>
      {action && (
        <ConfirmAction
          action={action}
          close={() => setAction(null)}
          done={() => {}}
        />
      )}
    </>
  );
}

function OperationsList({
  kind,
  context,
  options,
  filters,
  change,
}: {
  kind: OperationKind;
  context: Workspace;
  options: StockOptions;
  filters: StockFilters;
  change: (f: StockFilters) => void;
}) {
  const config = configs[kind],
    r = useResource<Page<StockOperation>>(
      `${config.endpoint}?${stockQuery({ ...filters, status: "" })}`,
    ),
    base = `/portail/${context.portal}/${kind}`,
    [action, setAction] = useState<AdminAction | null>(null),
    [notice, setNotice] = useState("");
  function reservationAction(row: StockOperation, key: "release" | "consume") {
    setAction({
      title:
        key === "release"
          ? "Libérer cette réservation ?"
          : "Consommer cette réservation ?",
      description:
        key === "release"
          ? "Les unités redeviennent disponibles. Le stock physique reste inchangé."
          : "Confirmez une sortie physique réelle des unités réservées. Cette opération réduit simultanément le physique et le réservé, sans créer de commande ou de livraison.",
      reason: key === "consume",
      submit: (reason) =>
        api(`/stock-reservations/${row.id}/${key}`, {
          method: "POST",
          body: JSON.stringify({
            version: row.version,
            ...(reason ? { reason } : {}),
          }),
        }),
    });
  }
  return (
    <>
      <div className="stock-heading">
        <div>
          <h1>{config.title}</h1>
          <p>
            {context.scope === "SHOP"
              ? "Consultez les opérations concernant uniquement les produits de votre boutique."
              : "Suivez les opérations réellement enregistrées dans votre périmètre."}
          </p>
        </div>
        {canWrite(context, config.permission) && (
          <Link className="ds-button ds-primary" to={`${base}/nouveau`}>
            {config.create}
          </Link>
        )}
      </div>
      <StockFeedback notice={notice} />
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
                caption={config.title}
                columns={[
                  "Référence",
                  "Entreprise / agence",
                  "Boutique",
                  "État / quantité",
                  "Date",
                  "Actions",
                ]}
                rows={r.data.items.map((o) => [
                  o.reference,
                  <div>
                    {o.company?.name ??
                      options.companies.find((c) => c.id === o.companyId)
                        ?.name ??
                      context.companyName}
                    <small className="admin-block">
                      {kind === "transferts-stock"
                        ? `${o.originAgency?.name ?? "—"} → ${o.destinationAgency?.name ?? "—"}`
                        : (o.agency?.name ?? o.stock?.agency.name ?? "—")}
                    </small>
                  </div>,
                  operationShop(o, options),
                  <div>
                    {o.status ? (
                      <StockBadge
                        value={
                          kind === "transferts-stock" && o.status === "RECEIVED"
                            ? "COMPLETED"
                            : o.status
                        }
                      />
                    ) : (
                      <StockBadge value="COMPLETED" />
                    )}
                    {o.quantity != null && (
                      <span> · {quantity(o.quantity)} unité(s)</span>
                    )}
                  </div>,
                  stockDate(o.createdAt),
                  kind === "reservations" ? (
                    <div className="ds-actions">
                      {o.status === "ACTIVE" &&
                        canWrite(context, config.permission) && (
                          <>
                            <Button
                              variant="ghost"
                              onClick={() => reservationAction(o, "release")}
                            >
                              Libérer
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => reservationAction(o, "consume")}
                            >
                              Sortir les unités
                            </Button>
                          </>
                        )}
                      {o.stock?.product.name && (
                        <small>{o.stock.product.name}</small>
                      )}
                    </div>
                  ) : kind === "sorties" ? (
                    <div>
                      {o.reason}
                      <small className="admin-block">{o.recipient ?? ""}</small>
                    </div>
                  ) : (
                    <Link to={`${base}/${o.id}`}>Consulter</Link>
                  ),
                ])}
              />
            ) : (
              <EmptyState
                title="Aucune opération dans cette sélection."
                description="Les opérations enregistrées apparaîtront ici."
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

function ItemTable({
  items,
  transfer = false,
}: {
  items: OperationItem[];
  transfer?: boolean;
}) {
  return (
    <DataTable
      caption="Lignes de l’opération"
      columns={
        transfer
          ? [
              "Produit / SKU",
              "Envoyé",
              "Réceptionné",
              "Perte validée",
              "Retourné à l’origine",
              "En transit",
            ]
          : ["Produit / SKU", "Quantité"]
      }
      rows={items.map((i) => [
        <div className="admin-company-name">
          {i.product?.name ?? "Produit"}
          <small>{i.product?.sku ?? "Sans SKU"}</small>
        </div>,
        quantity(i.quantity),
        ...(transfer
          ? [
              quantity(i.receivedQuantity ?? 0),
              quantity(i.lostQuantity ?? 0),
              quantity(i.returnedQuantity ?? 0),
              quantity(
                i.inTransitQuantity ??
                  i.quantity -
                    (i.receivedQuantity ?? 0) -
                    (i.lostQuantity ?? 0) -
                    (i.returnedQuantity ?? 0),
              ),
            ]
          : []),
      ])}
    />
  );
}
function ReceiveForm({
  operation,
  save,
}: {
  operation: StockOperation;
  save: (action: AdminAction) => void;
}) {
  const [counts, setCounts] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      items = operation.items
        .map((i) => ({ itemId: i.id, quantity: Number(counts[i.id] ?? 0) }))
        .filter((i) => i.quantity > 0);
    if (!items.length || items.some((i) => !Number.isSafeInteger(i.quantity))) {
      setError("Indiquez au moins une quantité entière reçue.");
      return;
    }
    setError("");
    save({
      title: "Confirmer les quantités reçues ?",
      description:
        "Seules les quantités renseignées entrent dans le stock de destination. Le reliquat reste en transit et peut faire l’objet d’un incident.",
      submit: () =>
        api(`/stock-transfers/${operation.id}/receive`, {
          method: "POST",
          body: JSON.stringify({
            version: operation.version,
            items,
            ...(f.get("notes") ? { notes: String(f.get("notes")) } : {}),
          }),
        }),
    });
  }
  return (
    <Card title="Réception complète ou partielle">
      <form className="stock-form" onSubmit={submit}>
        <div className="stock-count-grid">
          {operation.items.map((i) => {
            const remaining = freeTransit(operation, i);
            return remaining > 0 ? (
              <div className="stock-count-row" key={i.id}>
                <strong>{i.product.name}</strong>
                <span>{quantity(remaining)} en transit</span>
                <Field
                  label="Quantité reçue maintenant"
                  type="number"
                  min={0}
                  max={remaining}
                  step={1}
                  value={counts[i.id] ?? "0"}
                  onChange={(e) =>
                    setCounts({ ...counts, [i.id]: e.target.value })
                  }
                />
              </div>
            ) : null;
          })}
        </div>
        <p className="stock-info">
          Les quantités couvertes par un incident ouvert sont réservées à son
          traitement et ne peuvent pas être réceptionnées une seconde fois.
        </p>
        <Textarea
          label="Observation de réception"
          name="notes"
          maxLength={1000}
        />
        <StockFeedback error={error} />
        <Button type="submit">Vérifier la réception</Button>
      </form>
    </Card>
  );
}
function IncidentForm({
  operation,
  save,
}: {
  operation: StockOperation;
  save: (action: AdminAction) => void;
}) {
  const [itemId, setItemId] = useState(
    operation.items.find((i) => freeTransit(operation, i) > 0)?.id ?? "",
  );
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      count = Number(f.get("quantity"));
    save({
      title: "Déclarer cet incident ?",
      description:
        "L’incident est conservé pour traitement. Aucune perte définitive n’est enregistrée sans validation explicite.",
      submit: () =>
        api(`/stock-transfers/${operation.id}/incidents`, {
          method: "POST",
          body: JSON.stringify({
            version: operation.version,
            itemId,
            quantity: count,
            kind: String(f.get("kind")),
            description: String(f.get("description")),
          }),
        }),
    });
  }
  return (
    <Card title="Déclarer un incident de transfert">
      {!itemId ? (
        <p>
          Toutes les quantités restantes sont déjà couvertes par un incident.
          Traitez les incidents ouverts avant une nouvelle déclaration.
        </p>
      ) : (
        <form className="stock-form" onSubmit={submit}>
          <Select
            label="Produit concerné"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
          >
            {operation.items
              .filter((i) => freeTransit(operation, i) > 0)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.product.name}
                </option>
              ))}
          </Select>
          <div className="stock-form-grid">
            <Select label="Nature de l’incident" name="kind">
              <option value="MISSING">Article manquant</option>
              <option value="DAMAGED">Article endommagé</option>
              <option value="REFUSED">Réception refusée</option>
              <option value="OTHER">Autre incident</option>
            </Select>
            <Field
              label="Quantité concernée"
              name="quantity"
              type="number"
              min={1}
              max={freeTransit(
                operation,
                operation.items.find((i) => i.id === itemId)!,
              )}
              step={1}
              required
            />
          </div>
          <Textarea
            label="Description de l’incident"
            name="description"
            minLength={3}
            maxLength={1000}
            required
          />
          <Button type="submit">Déclarer l’incident</Button>
        </form>
      )}
    </Card>
  );
}
function Incidents({
  operation,
  canResolve,
  save,
  agencyId,
}: {
  operation: StockOperation;
  canResolve: boolean;
  save: (a: AdminAction) => void;
  agencyId?: string;
}) {
  const [selected, setSelected] = useState<TransferIncident | null>(null),
    [resolution, setResolution] = useState(
      agencyId && agencyId === operation.originAgencyId
        ? "RETURN_TO_ORIGIN"
        : "RECOVER_TO_DESTINATION",
    );
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const f = new FormData(e.currentTarget);
    save({
      title: "Valider le traitement de l’incident ?",
      description:
        resolution === "CONFIRM_LOSS"
          ? "La quantité sera déclarée perdue après validation. Cette décision sera auditée et ne supprimera aucun historique."
          : resolution === "RETURN_TO_ORIGIN"
            ? "Les unités retrouvées seront remises dans le stock physique de l’agence d’origine."
            : "Les unités retrouvées seront réceptionnées dans le stock physique de destination.",
      submit: () =>
        api(
          `/stock-transfers/${operation.id}/incidents/${selected.id}/resolve`,
          {
            method: "POST",
            body: JSON.stringify({
              version: operation.version,
              action: resolution,
              reason: String(f.get("reason")),
            }),
          },
        ),
    });
    setSelected(null);
  }
  return (
    <Card title="Incidents et traitement">
      {operation.incidents?.length ? (
        <>
          <DataTable
            caption="Incidents du transfert"
            columns={[
              "Produit",
              "Nature / description",
              "Quantité",
              "État / résolution",
              "Date",
              "",
            ]}
            rows={operation.incidents.map((i) => [
              i.product?.name ??
                operation.items.find((x) => x.id === i.itemId)?.product.name ??
                "—",
              <div>
                <StockBadge value={i.kind} />
                <p>{i.description}</p>
              </div>,
              quantity(i.quantity),
              <div>
                <StockBadge value={i.status} />
                <small>
                  {i.resolution
                    ? ({
                        RECOVER_TO_DESTINATION: "Réception à destination",
                        RETURN_TO_ORIGIN: "Retour à l’origine",
                        CONFIRM_LOSS: "Perte validée",
                      }[i.resolution] ?? i.resolution)
                    : ""}
                </small>
              </div>,
              stockDate(i.createdAt),
              i.status === "OPEN" && canResolve ? (
                <Button variant="ghost" onClick={() => setSelected(i)}>
                  Traiter
                </Button>
              ) : (
                "—"
              ),
            ])}
          />
          {selected && (
            <form className="stock-form" onSubmit={submit}>
              <h3>Traitement de l’incident</h3>
              <Select
                label="Résolution autorisée"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              >
                {(!agencyId || agencyId === operation.destinationAgencyId) && (
                  <option value="RECOVER_TO_DESTINATION">
                    Marchandise retrouvée à destination
                  </option>
                )}
                {(!agencyId || agencyId === operation.originAgencyId) && (
                  <option value="RETURN_TO_ORIGIN">
                    Retour à l’agence d’origine
                  </option>
                )}
                <option value="CONFIRM_LOSS">
                  Valider une perte définitive
                </option>
              </Select>
              <Textarea
                name="reason"
                label="Motif et constat"
                required
                minLength={3}
                maxLength={500}
              />
              <div className="ds-actions">
                <Button type="submit">Vérifier la clôture</Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSelected(null)}
                >
                  Annuler
                </Button>
              </div>
            </form>
          )}
        </>
      ) : (
        <EmptyState
          title="Aucun incident déclaré."
          description="Les anomalies constatées pendant le transfert apparaîtront ici."
        />
      )}
    </Card>
  );
}

function InventoryCounting({
  operation,
  done,
}: {
  operation: StockOperation;
  done: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
      Object.fromEntries(
        operation.items.map((i) => [
          i.id,
          i.countedQuantity == null ? "" : String(i.countedQuantity),
        ]),
      ),
    ),
    [reasons, setReasons] = useState<Record<string, string>>(
      Object.fromEntries(operation.items.map((i) => [i.id, i.reason ?? ""])),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const items = operation.items
      .filter((i) => values[i.id] !== "")
      .map((i) => ({
        itemId: i.id,
        countedQuantity: Number(values[i.id]),
        ...(reasons[i.id] ? { reason: reasons[i.id] } : {}),
      }));
    if (
      !items.length ||
      items.some(
        (i) =>
          !Number.isSafeInteger(i.countedQuantity) || i.countedQuantity < 0,
      )
    ) {
      setError("Saisissez des quantités entières positives ou nulles.");
      return;
    }
    setBusy(true);
    try {
      await api(`/inventories/${operation.id}/count`, {
        method: "POST",
        body: JSON.stringify({ version: operation.version, items }),
      });
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Comptage physique">
      <form className="stock-form" onSubmit={submit}>
        {operation.items.map((i) => (
          <div className="stock-count-row" key={i.id}>
            <div>
              <strong>{i.product.name}</strong>
              <small className="admin-block">
                Théorique {quantity(i.expectedPhysical)} · Réservé{" "}
                {quantity(i.expectedReserved)}
              </small>
            </div>
            <Field
              label="Quantité comptée"
              type="number"
              min={0}
              step={1}
              value={values[i.id] ?? ""}
              onChange={(e) => setValues({ ...values, [i.id]: e.target.value })}
            />
            <Field
              label="Justification de l’écart"
              value={reasons[i.id] ?? ""}
              maxLength={500}
              onChange={(e) =>
                setReasons({ ...reasons, [i.id]: e.target.value })
              }
            />
          </div>
        ))}
        <StockFeedback error={error} />
        <Button type="submit" busy={busy}>
          Enregistrer les comptages
        </Button>
        <p className="stock-info">
          Les comptages n’écrivent aucun mouvement. Les corrections seront
          soumises puis validées par une personne autorisée.
        </p>
      </form>
    </Card>
  );
}

function OperationDetail({
  kind,
  id,
  context,
  options,
}: {
  kind: OperationKind;
  id: string;
  context: Workspace;
  options: StockOptions;
}) {
  const config = configs[kind],
    r = useResource<StockOperation>(`${config.endpoint}/${id}`),
    [action, setAction] = useState<AdminAction | null>(null),
    [notice, setNotice] = useState(""),
    [receiving, setReceiving] = useState(false),
    [incident, setIncident] = useState(false);
  const o = r.data,
    can = canWrite(context, config.permission),
    originAllowed = !context.agencyId || o?.originAgencyId === context.agencyId,
    destinationAllowed =
      !context.agencyId || o?.destinationAgencyId === context.agencyId;
  function transition(
    key: string,
    title: string,
    description: string,
    reason = false,
  ) {
    if (!o) return;
    setAction({
      title,
      description,
      reason,
      submit: (reasonText) =>
        api(`${config.endpoint}/${id}/${key}`, {
          method: "POST",
          body: JSON.stringify({
            version: o.version,
            ...(reasonText ? { reason: reasonText } : {}),
          }),
        }),
    });
  }
  return (
    <>
      <Link className="stock-back" to={`/portail/${context.portal}/${kind}`}>
        ← {config.title}
      </Link>
      <h1>
        {config.singular} {o?.reference ?? ""}
      </h1>
      <StockFeedback notice={notice} />
      <StockResource {...r}>
        {o && (
          <>
            <Card title="Fiche de l’opération">
              <StockBadge
                value={
                  kind === "transferts-stock" && o.status === "RECEIVED"
                    ? "COMPLETED"
                    : o.status
                }
              />
              <dl className="stock-details">
                {[
                  [
                    "Entreprise",
                    o.company?.name ??
                      options.companies.find((c) => c.id === o.companyId)
                        ?.name ??
                      context.companyName,
                  ],
                  ["Boutique", operationShop(o, options)],
                  [
                    kind === "transferts-stock" ? "Origine" : "Agence",
                    kind === "transferts-stock"
                      ? o.originAgency?.name
                      : o.agency?.name,
                  ],
                  ["Destination", o.destinationAgency?.name],
                  ["Enregistré le", stockDate(o.createdAt)],
                  ["Réception", stockDate(o.confirmedAt ?? o.receivedAt)],
                  ["Départ", stockDate(o.departedAt)],
                  ["Auteur", o.actor?.fullName],
                  ["Observation", o.notes],
                  ["Motif", o.reason],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
              {kind !== "inventaires" && (
                <ItemTable
                  items={o.items ?? []}
                  transfer={kind === "transferts-stock"}
                />
              )}
              <div className="ds-actions">
                {can && kind === "depots" && o.status === "DRAFT" && (
                  <>
                    <Button
                      onClick={() =>
                        transition(
                          "confirm",
                          "Confirmer la réception physique ?",
                          "Les quantités du dépôt entreront dans le stock physique et disponible. Confirmez uniquement les marchandises réellement reçues.",
                        )
                      }
                    >
                      Confirmer la réception
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() =>
                        transition(
                          "cancel",
                          "Annuler ce brouillon ?",
                          "Aucune quantité de stock n’a encore été ajoutée.",
                          true,
                        )
                      }
                    >
                      Annuler le dépôt
                    </Button>
                  </>
                )}
                {can &&
                  kind === "transferts-stock" &&
                  o.status === "DRAFT" &&
                  originAllowed && (
                    <>
                      <Button
                        onClick={() =>
                          transition(
                            "dispatch",
                            "Confirmer le départ ?",
                            "Les quantités quitteront le stock physique d’origine et seront placées en transit. Elles ne seront disponibles à destination qu’après réception.",
                          )
                        }
                      >
                        Valider le départ
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() =>
                          transition(
                            "cancel",
                            "Annuler ce transfert ?",
                            "Le brouillon sera annulé, sans déplacement de stock.",
                            true,
                          )
                        }
                      >
                        Annuler le transfert
                      </Button>
                    </>
                  )}
                {can &&
                  kind === "transferts-stock" &&
                  o.status === "IN_TRANSIT" && (
                    <>
                      {destinationAllowed && (
                        <Button onClick={() => setReceiving(!receiving)}>
                          Réceptionner des unités
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onClick={() => setIncident(!incident)}
                      >
                        Déclarer un incident
                      </Button>
                    </>
                  )}
                {can && kind === "inventaires" && o.status === "DRAFT" && (
                  <Button
                    onClick={() =>
                      transition(
                        "submit",
                        "Soumettre les comptages ?",
                        "Les comptages seront présentés pour validation. Les soldes de stock restent inchangés à cette étape.",
                      )
                    }
                  >
                    Soumettre pour validation
                  </Button>
                )}
                {canWrite(context, "stocks.approve") &&
                  kind === "inventaires" &&
                  o.status === "SUBMITTED" && (
                    <>
                      <Button
                        onClick={() =>
                          transition(
                            "approve",
                            "Valider les corrections d’inventaire ?",
                            "Chaque écart sera appliqué par un mouvement d’ajustement audité. Une modification du stock depuis le comptage peut imposer un nouvel inventaire.",
                            true,
                          )
                        }
                      >
                        Valider les ajustements
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() =>
                          transition(
                            "reject",
                            "Rejeter cet inventaire ?",
                            "Les comptages restent conservés. Aucun ajustement ne sera appliqué.",
                            true,
                          )
                        }
                      >
                        Rejeter
                      </Button>
                    </>
                  )}
              </div>
            </Card>
            {kind === "transferts-stock" && (
              <>
                {receiving &&
                  can &&
                  o.status === "IN_TRANSIT" &&
                  destinationAllowed && (
                    <ReceiveForm operation={o} save={setAction} />
                  )}
                {incident && can && o.status === "IN_TRANSIT" && (
                  <IncidentForm operation={o} save={setAction} />
                )}
                <Incidents
                  operation={o}
                  canResolve={canWrite(context, "stocks.approve")}
                  save={setAction}
                  agencyId={context.agencyId}
                />
                <Card title="Historique du transfert">
                  {o.events?.length ? (
                    <DataTable
                      caption="Étapes du transfert"
                      columns={["Date", "État", "Auteur", "Observation"]}
                      rows={o.events.map((e) => [
                        stockDate(e.createdAt),
                        <StockBadge
                          value={
                            e.status === "RECEIVED" ? "COMPLETED" : e.status
                          }
                        />,
                        e.actor?.fullName ?? "—",
                        e.notes ?? "—",
                      ])}
                    />
                  ) : (
                    <p>Aucun événement complémentaire à afficher.</p>
                  )}
                </Card>
              </>
            )}
            {kind === "inventaires" &&
              (can && o.status === "DRAFT" ? (
                <InventoryCounting
                  key={o.version}
                  operation={o}
                  done={() => {
                    setNotice("Comptages enregistrés.");
                    r.reload();
                  }}
                />
              ) : (
                <Card title="Comparaison de l’inventaire">
                  <DataTable
                    caption="Stock théorique et compté"
                    columns={[
                      "Produit",
                      "Théorique",
                      "Réservé",
                      "Compté",
                      "Écart",
                      "Justification",
                    ]}
                    rows={(o.items ?? []).map((i) => [
                      i.product.name,
                      quantity(i.expectedPhysical),
                      quantity(i.expectedReserved),
                      quantity(i.countedQuantity),
                      i.countedQuantity == null
                        ? "—"
                        : quantity(
                            i.variance ??
                              i.countedQuantity - (i.expectedPhysical ?? 0),
                          ),
                      i.reason ?? "—",
                    ])}
                  />
                </Card>
              ))}
          </>
        )}
      </StockResource>
      {action && (
        <ConfirmAction
          action={action}
          close={() => setAction(null)}
          done={(m) => {
            setNotice(m);
            setReceiving(false);
            setIncident(false);
            r.reload();
          }}
        />
      )}
    </>
  );
}
export function StockOperations({
  context,
  moduleId,
  id,
  options,
  filters,
  change,
}: {
  context: Workspace;
  moduleId: string;
  id?: string;
  options: StockOptions;
  filters: StockFilters;
  change: (f: StockFilters) => void;
}) {
  const kind = moduleId as OperationKind,
    config = configs[kind];
  if (!config) return <EmptyState title="Module de stock indisponible." />;
  if (id === "nouveau")
    return canWrite(context, config.permission) ? (
      <NewOperation kind={kind} context={context} options={options} />
    ) : (
      <p>Cette opération n’est pas autorisée dans votre contexte.</p>
    );
  if (id && !["sorties", "reservations"].includes(kind))
    return (
      <OperationDetail
        kind={kind}
        id={id}
        context={context}
        options={options}
      />
    );
  return (
    <OperationsList
      kind={kind}
      context={context}
      options={options}
      filters={filters}
      change={change}
    />
  );
}
