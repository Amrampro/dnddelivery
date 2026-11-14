import { useState } from "react";
import { Text } from "react-native";
import type { Workspace } from "../auth/types";
import { api } from "../auth/client";
import {
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
import {
  LoadState,
  Pager,
  quantity,
  useStockData,
  localKey,
  type Page,
} from "./ui";
import type { Product } from "./CatalogScreen";
import {
  creationTitles,
  paths,
  type Options,
  type Operation,
  type OperationKind,
  type Stock,
} from "./models";
export function ProductPicker({
  shopId,
  onSelect,
  onClose,
}: {
  shopId: string;
  onSelect: (product: Product) => void;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    r = useStockData<Page<Product>>(
      `/products?${new URLSearchParams({ shopId, status: "ACTIVE", q: search, page: String(page), size: "15" })}`,
    );
  return (
    <Sheet open onClose={onClose} title="Choisir un produit">
      <Input
        label="Rechercher un produit ou un SKU"
        value={q}
        onChangeText={setQ}
      />
      <Button
        secondary
        title="Rechercher"
        onPress={() => {
          setSearch(q.trim());
          setPage(1);
        }}
      />
      {!r.data ? (
        <LoadState error={r.error} retry={r.reload} />
      ) : (
        <>
          {r.data.items.map((p) => (
            <ListRow
              key={p.id}
              title={p.name}
              description={`${p.sku ?? "Sans SKU"} · ${p.unit}`}
              icon="box"
              onPress={() => onSelect(p)}
            />
          ))}
          {!r.data.items.length && (
            <EmptyState
              title="Aucun produit actif"
              description="Créez d’abord ce produit dans le catalogue de la boutique."
              icon="box"
            />
          )}
          <Pager page={page} total={r.data.total} setPage={setPage} />
        </>
      )}
    </Sheet>
  );
}
function StockPicker({
  onSelect,
  onClose,
}: {
  onSelect: (stock: Stock) => void;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    r = useStockData<Page<Stock>>(
      `/stocks?${new URLSearchParams({ q: search, page: String(page), size: "15", status: "AVAILABLE" })}`,
    );
  return (
    <Sheet open onClose={onClose} title="Choisir un stock disponible">
      <Input label="Rechercher un produit" value={q} onChangeText={setQ} />
      <Button
        secondary
        title="Rechercher"
        onPress={() => {
          setSearch(q.trim());
          setPage(1);
        }}
      />
      {!r.data ? (
        <LoadState error={r.error} retry={r.reload} />
      ) : (
        <>
          {r.data.items.map((s) => (
            <ListRow
              key={s.id}
              title={s.product.name}
              description={`${s.shop.name} · ${s.agency.name}\n${s.availableQuantity} disponible(s) · ${s.reservedQuantity} réservé(s)`}
              icon="box"
              onPress={() => onSelect(s)}
            />
          ))}
          {!r.data.items.length && (
            <EmptyState
              title="Aucun stock disponible"
              description="Vérifiez vos agences autorisées et les réceptions de marchandises."
            />
          )}
          <Pager page={page} total={r.data.total} setPage={setPage} />
        </>
      )}
    </Sheet>
  );
}
export function OperationForm({
  kind,
  context,
  options,
  onClose,
  onCreated,
}: {
  kind: OperationKind;
  context: Workspace;
  options: Options;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [reference, setReference] = useState(localKey),
    [agencyId, setAgency] = useState(context.agencyId ?? ""),
    [destination, setDestination] = useState(""),
    [shopId, setShop] = useState(""),
    [notes, setNotes] = useState(""),
    [reason, setReason] = useState(""),
    [recipient, setRecipient] = useState(""),
    [withdrawalKind, setWithdrawalKind] = useState("RETURN"),
    [stock, setStock] = useState<Stock | null>(null),
    [amount, setAmount] = useState(""),
    [lines, setLines] = useState<{ product: Product; quantity: string }[]>([]),
    [productPicker, setProductPicker] = useState(false),
    [stockPicker, setStockPicker] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const multi = kind === "depots" || kind === "transferts-stock",
    stockOperation = kind === "sorties" || kind === "reservations";
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (!reference.trim())
        throw new Error("Indiquez une référence d’opération.");
      let body: Record<string, unknown> = { reference: reference.trim() };
      if (stockOperation) {
        if (!stock) throw new Error("Choisissez un stock disponible.");
        body = {
          ...body,
          stockId: stock.id,
          quantity: quantity(amount),
          ...(kind === "sorties"
            ? {
                kind: withdrawalKind,
                reason,
                recipient: recipient || undefined,
              }
            : { notes: notes || undefined }),
        };
        if (kind === "sorties" && !reason.trim())
          throw new Error("Indiquez le motif de la sortie.");
      } else {
        if (!agencyId) throw new Error("Choisissez l’agence concernée.");
        if (multi) {
          if (!shopId || !lines.length)
            throw new Error(
              "Choisissez une boutique et ajoutez au moins un produit.",
            );
          body = {
            ...body,
            shopId,
            items: lines.map((l) => ({
              productId: l.product.id,
              quantity: quantity(l.quantity),
            })),
          };
        } else if (shopId) body.shopId = shopId;
        body.notes = notes || undefined;
        if (kind === "transferts-stock") {
          if (!destination || destination === agencyId)
            throw new Error("Choisissez une autre agence de destination.");
          body.originAgencyId = agencyId;
          body.destinationAgencyId = destination;
        } else body.agencyId = agencyId;
      }
      const result = await api<Operation>(paths[kind], {
        method: "POST",
        body: JSON.stringify(body),
      });
      onCreated(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Sheet
        open={!productPicker && !stockPicker}
        onClose={() => {
          if (!busy) onClose();
        }}
        title={creationTitles[kind]}
      >
        <Input
          label="Référence de l’opération"
          value={reference}
          onChangeText={setReference}
        />
        {stockOperation ? (
          <>
            <Button
              secondary
              title={
                stock
                  ? "Changer le stock sélectionné"
                  : "Choisir un stock disponible"
              }
              onPress={() => setStockPicker(true)}
            />
            {stock && (
              <Card>
                <Text style={ui.sectionTitle}>{stock.product.name}</Text>
                <Text style={ui.body}>
                  {stock.shop.name} · {stock.agency.name}
                  {"\n"}
                  {stock.availableQuantity} disponible(s),{" "}
                  {stock.reservedQuantity} réservé(s)
                </Text>
              </Card>
            )}
            <Input
              label="Quantité entière"
              value={amount}
              keyboardType="number-pad"
              onChangeText={setAmount}
            />
            {kind === "sorties" ? (
              <>
                <Selector
                  label="Type de sortie"
                  value={withdrawalKind}
                  options={[
                    { id: "RETURN", label: "Restitution à la boutique" },
                    { id: "WITHDRAWAL", label: "Retrait autorisé" },
                  ]}
                  onChange={setWithdrawalKind}
                />
                <Input
                  label="Motif obligatoire"
                  value={reason}
                  multiline
                  onChangeText={setReason}
                />
                <Input
                  label="Destinataire du retrait"
                  value={recipient}
                  onChangeText={setRecipient}
                />
              </>
            ) : (
              <Input
                label="Observation"
                value={notes}
                multiline
                onChangeText={setNotes}
              />
            )}
          </>
        ) : (
          <>
            <Selector
              label={
                kind === "transferts-stock" ? "Agence d’origine" : "Agence"
              }
              value={agencyId}
              disabled={!!context.agencyId}
              options={options.agencies.map((a) => ({
                id: a.id,
                label: a.name,
              }))}
              onChange={setAgency}
            />
            {kind === "transferts-stock" && (
              <Selector
                label="Agence de destination"
                value={destination}
                options={(options.destinationAgencies ?? options.agencies)
                  .filter((a) => a.id !== agencyId)
                  .map((a) => ({ id: a.id, label: a.name }))}
                onChange={setDestination}
              />
            )}
            <Selector
              label={multi ? "Boutique propriétaire" : "Boutique (facultative)"}
              value={shopId}
              options={[
                ...(!multi
                  ? [{ id: "", label: "Toutes les boutiques autorisées" }]
                  : []),
                ...options.shops.map((s) => ({ id: s.id, label: s.name })),
              ]}
              onChange={(value) => {
                setShop(value);
                setLines([]);
              }}
            />
            {multi && (
              <>
                <Text style={ui.sectionTitle}>Produits et quantités</Text>
                {lines.map((l, i) => (
                  <Card key={l.product.id}>
                    <Text style={ui.rowTitle}>{l.product.name}</Text>
                    <Input
                      label={`Quantité reçue ou transférée · ${l.product.name}`}
                      keyboardType="number-pad"
                      value={l.quantity}
                      onChangeText={(value) =>
                        setLines((old) =>
                          old.map((line, index) =>
                            index === i ? { ...line, quantity: value } : line,
                          ),
                        )
                      }
                    />
                    <Button
                      secondary
                      title="Retirer cette ligne"
                      onPress={() =>
                        setLines((old) => old.filter((_, index) => index !== i))
                      }
                    />
                  </Card>
                ))}
                <Button
                  secondary
                  title="Ajouter un produit"
                  disabled={!shopId}
                  onPress={() => setProductPicker(true)}
                />
              </>
            )}
            <Input
              label="Observation"
              value={notes}
              multiline
              onChangeText={setNotes}
            />
          </>
        )}
        {!!error && <ErrorMessage message={error} />}
        <Text style={ui.body}>
          {kind === "depots"
            ? "Le stock augmentera après confirmation de la réception physique."
            : kind === "transferts-stock"
              ? "Le départ et la réception seront confirmés séparément."
              : kind === "inventaires"
                ? "Les quantités seront comptées puis soumises à validation."
                : "Les droits et les quantités disponibles seront vérifiés par le serveur."}
        </Text>
        <Button
          title={
            kind === "sorties"
              ? "Valider la sortie"
              : kind === "reservations"
                ? "Réserver cette quantité"
                : "Enregistrer la préparation"
          }
          busy={busy}
          onPress={() => void save()}
        />
        <Button secondary title="Annuler" disabled={busy} onPress={onClose} />
      </Sheet>
      {productPicker && (
        <ProductPicker
          shopId={shopId}
          onClose={() => setProductPicker(false)}
          onSelect={(product) => {
            if (lines.some((l) => l.product.id === product.id))
              setError("Ce produit est déjà présent dans les lignes.");
            else setLines((old) => [...old, { product, quantity: "" }]);
            setProductPicker(false);
          }}
        />
      )}
      {stockPicker && (
        <StockPicker
          onClose={() => setStockPicker(false)}
          onSelect={(value) => {
            setStock(value);
            setStockPicker(false);
          }}
        />
      )}
    </>
  );
}
