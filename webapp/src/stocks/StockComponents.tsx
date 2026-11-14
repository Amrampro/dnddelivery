import { stockLabels } from "./stockLogic";
import { useState, type ReactNode } from "react";
import { useResource } from "../admin/useResource";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Select,
  Skeleton,
} from "../design/ui";

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}
export interface Named {
  id: string;
  name?: string;
  reference?: string;
  sku?: string | null;
  label?: string;
  product?: { name: string; sku?: string | null };
  shop?: { name: string };
  agency?: { name: string };
  company?: { name: string };
  availableQuantity?: number;
  physicalQuantity?: number;
  reservedQuantity?: number;
}
export function StockFeedback({
  error,
  notice,
}: {
  error?: string;
  notice?: string;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="ds-error-text">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="stock-notice">
          {notice}
        </p>
      )}
    </>
  );
}
export function StockResource({
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
export function StockPager({
  page,
  total,
  size = 20,
  change,
}: {
  page: number;
  total: number;
  size?: number;
  change: (v: number) => void;
}) {
  return (
    <div className="admin-toolbar stock-pager">
      <Button
        variant="secondary"
        type="button"
        disabled={page <= 1}
        onClick={() => change(page - 1)}
      >
        Précédent
      </Button>
      <span>
        Page {page} · {total} résultat(s)
      </span>
      <Button
        variant="secondary"
        type="button"
        disabled={page * size >= total}
        onClick={() => change(page + 1)}
      >
        Suivant
      </Button>
    </div>
  );
}
export function StockBadge({ value }: { value: string }) {
  return (
    <Badge
      tone={
        [
          "CONFIRMED",
          "RECEIVED",
          "ACTIVE",
          "COMPLETED",
          "APPROVED",
          "RESOLVED",
        ].includes(value)
          ? "success"
          : [
                "DRAFT",
                "PENDING",
                "SUBMITTED",
                "IN_TRANSIT",
                "LOW",
                "PARTIALLY_RECEIVED",
                "OPEN",
              ].includes(value)
            ? "warning"
            : ["REJECTED", "OUT_OF_STOCK", "DAMAGED", "MISSING"].includes(value)
              ? "danger"
              : "neutral"
      }
    >
      {stockLabels[value] ?? value}
    </Badge>
  );
}
const defaultLabel = (item: Named) =>
  item.product
    ? `${item.product.name}${item.product.sku ? ` · ${item.product.sku}` : ""}${item.agency ? ` · ${item.agency.name}` : ""}`
    : (item.label ??
      `${item.name ?? item.reference ?? "Élément"}${item.sku ? ` · ${item.sku}` : ""}`);
export function StockPicker<T extends Named = Named>({
  endpoint,
  label,
  value,
  change,
  required = false,
  initial,
  labelFor = defaultLabel,
  disabled = false,
}: {
  endpoint: string;
  label: string;
  value: string;
  change: (value: string, item?: T) => void;
  required?: boolean;
  initial?: T;
  labelFor?: (v: T) => string;
  disabled?: boolean;
}) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    r = useResource<Page<T>>(
      `${endpoint}${endpoint.includes("?") ? "&" : "?"}q=${encodeURIComponent(q)}&page=${page}&size=20`,
    );
  const choices = r.data?.items ?? [],
    selected =
      choices.find((x) => x.id === value) ??
      (initial?.id === value ? initial : undefined);
  return (
    <div className="stock-picker">
      <Field
        label={`Rechercher — ${label.toLocaleLowerCase("fr")}`}
        value={q}
        disabled={disabled}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      <Select
        label={label}
        value={value}
        required={required}
        disabled={disabled || r.loading}
        onChange={(e) =>
          change(
            e.target.value,
            choices.find((x) => x.id === e.target.value),
          )
        }
      >
        <option value="">Choisir…</option>
        {value && !choices.some((x) => x.id === value) && (
          <option value={value}>
            {selected ? labelFor(selected) : "Sélection conservée"}
          </option>
        )}
        {choices.map((x) => (
          <option key={x.id} value={x.id}>
            {labelFor(x)}
          </option>
        ))}
      </Select>
      {r.error ? (
        <p role="alert" className="ds-error-text">
          {r.error}
        </p>
      ) : (
        r.data && (
          <StockPager
            page={page}
            total={r.data.total}
            size={r.data.size}
            change={setPage}
          />
        )
      )}
    </div>
  );
}
export interface ItemLine {
  productId: string;
  quantity: number;
  name?: string;
  stockId?: string;
}
export function StockLines({
  endpoint,
  items,
  change,
  productLabel = "Produit",
  stock = false,
}: {
  endpoint: string;
  items: ItemLine[];
  change: (v: ItemLine[]) => void;
  productLabel?: string;
  stock?: boolean;
}) {
  const [selected, setSelected] = useState<Named>(),
    [id, setId] = useState(""),
    [count, setCount] = useState(1);
  function add() {
    if (!id || !Number.isSafeInteger(count) || count <= 0) return;
    const productId = stock
      ? ((selected as Named & { productId?: string })?.productId ?? id)
      : id;
    if (items.some((x) => x.productId === productId)) return;
    change([
      ...items,
      {
        productId,
        quantity: count,
        name: selected ? defaultLabel(selected) : "Produit",
        ...(stock ? { stockId: id } : {}),
      },
    ]);
    setId("");
    setSelected(undefined);
    setCount(1);
  }
  return (
    <Card title="Produits de l’opération">
      <div className="stock-line-entry">
        <StockPicker
          endpoint={endpoint}
          label={productLabel}
          value={id}
          change={(value, item) => {
            setId(value);
            setSelected(item);
          }}
          initial={selected}
        />
        <Field
          label="Quantité entière"
          type="number"
          min={1}
          max={2147483647}
          step={1}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!id || !Number.isSafeInteger(count) || count < 1}
          onClick={add}
        >
          Ajouter la ligne
        </Button>
      </div>
      {items.length ? (
        <ul className="stock-item-lines">
          {items.map((item, index) => (
            <li key={item.productId}>
              <strong>{item.name}</strong>
              <Field
                label={`Quantité — ${item.name}`}
                type="number"
                min={1}
                step={1}
                value={item.quantity}
                onChange={(e) =>
                  change(
                    items.map((x, i) =>
                      i === index
                        ? { ...x, quantity: Number(e.target.value) }
                        : x,
                    ),
                  )
                }
              />
              <Button
                variant="ghost"
                type="button"
                onClick={() => change(items.filter((_, i) => i !== index))}
              >
                Retirer
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Ajoutez les produits concernés."
          description="Les quantités ne changeront qu’après la validation de l’opération."
        />
      )}
    </Card>
  );
}
