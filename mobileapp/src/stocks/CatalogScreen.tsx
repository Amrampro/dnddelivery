import { useState } from "react";
import { Image, Text, View } from "react-native";
import type { Workspace } from "../auth/types";
import { api } from "../auth/client";
import {
  Badge,
  Button,
  Card,
  Confirm,
  EmptyState,
  ErrorMessage,
  Input,
  ListRow,
  Selector,
  Sheet,
  ui,
} from "../design/ui";
import { LoadState, Pager, useStockData, type Page } from "./ui";
export type { CatalogProduct as Product } from "../../../shared/stocks";
import type { CatalogProduct as Product } from "../../../shared/stocks";
function ProductImage({ url, name }: { url?: string | null; name: string }) {
  const r = useStockData<{ mime: string; image: string }>(url ?? null);
  return r.data ? (
    <Image
      accessibilityLabel={name}
      source={{ uri: `data:${r.data.mime};base64,${r.data.image}` }}
      style={{ width: 150, height: 120 }}
      resizeMode="contain"
    />
  ) : null;
}
function ProductDetail({
  id,
  context,
  onBack,
}: {
  id: string;
  context: Workspace;
  onBack: () => void;
}) {
  const r = useStockData<Product>(`/products/${id}`),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<Record<string, string>>({}),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  if (!r.data) return <LoadState error={r.error} retry={r.reload} />;
  const p = r.data,
    can =
      context.scope === "SHOP" &&
      context.permissions.includes("shop.products.manage");
  function edit() {
    setDraft({
      name: p.name,
      sku: p.sku ?? "",
      description: p.description ?? "",
      category: p.category ?? "",
      unit: p.unit,
    });
    setEditing(true);
    setError("");
  }
  async function save(archive = false) {
    setBusy(true);
    setError("");
    try {
      await api(`/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(
          archive
            ? {
                version: p.version,
                name: p.name,
                sku: p.sku,
                description: p.description,
                category: p.category,
                unit: p.unit,
                active: !p.active,
              }
            : {
                version: p.version,
                ...draft,
                sku: draft.sku || null,
                description: draft.description || null,
                category: draft.category || null,
                active: p.active,
              },
        ),
      });
      setEditing(false);
      setConfirm(false);
      setNotice("Catalogue mis à jour.");
      r.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button secondary title="Retour au catalogue" onPress={onBack} />
      <Card>
        <ProductImage url={p.imageUrl} name={p.name} />
        <Text role="heading" style={ui.sectionTitle}>
          {p.name}
        </Text>
        <Badge success={p.active}>{p.active ? "Actif" : "Archivé"}</Badge>
        <Text style={ui.body}>
          SKU : {p.sku ?? "Non renseigné"}
          {"\n"}Unité : {p.unit}
          {p.shop?.name ? `\nBoutique : ${p.shop.name}` : ""}
        </Text>
        {!!p.category && <Text style={ui.body}>{p.category}</Text>}
        {!!p.description && <Text style={ui.body}>{p.description}</Text>}
        {!!notice && (
          <Text role="status" style={ui.body}>
            {notice}
          </Text>
        )}
        {can && (
          <>
            <Button secondary title="Modifier le produit" onPress={edit} />
            <Button
              secondary
              title={p.active ? "Archiver le produit" : "Réactiver le produit"}
              onPress={() => setConfirm(true)}
            />
          </>
        )}
        <Button secondary title="Actualiser" onPress={r.reload} />
        {!!error && !editing && <ErrorMessage message={error} />}
      </Card>
      <Sheet
        open={editing}
        onClose={() => {
          if (!busy) setEditing(false);
        }}
        title="Modifier le produit"
      >
        {[
          ["name", "Nom du produit"],
          ["sku", "SKU (facultatif)"],
          ["category", "Catégorie (facultative)"],
          ["unit", "Unité de gestion"],
          ["description", "Description"],
        ].map(([key, label]) => (
          <Input
            key={key}
            label={label!}
            value={draft[key!] ?? ""}
            multiline={key === "description"}
            onChangeText={(value) => setDraft((v) => ({ ...v, [key!]: value }))}
          />
        ))}
        {!!error && <ErrorMessage message={error} />}
        <Button title="Enregistrer" busy={busy} onPress={() => void save()} />
      </Sheet>
      <Confirm
        open={confirm}
        onClose={() => {
          if (!busy) setConfirm(false);
        }}
        title={p.active ? "Archiver ce produit" : "Réactiver ce produit"}
        description={
          p.active
            ? "Le produit restera dans les historiques. Son archivage sera vérifié par le serveur."
            : "Ce produit sera de nouveau proposé dans votre catalogue actif."
        }
        busy={busy}
        onConfirm={() => void save(true)}
      />
    </>
  );
}
export function CatalogScreen({ context }: { context: Workspace }) {
  const [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("ACTIVE"),
    [selected, setSelected] = useState(""),
    [create, setCreate] = useState(false),
    [draft, setDraft] = useState({
      name: "",
      sku: "",
      description: "",
      category: "",
      unit: "piece",
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    r = useStockData<Page<Product>>(
      `/products?${new URLSearchParams({ q: search, ...(status ? { status } : {}), page: String(page), size: "15" })}`,
    );
  const can =
    context.scope === "SHOP" &&
    context.permissions.includes("shop.products.manage");
  async function save() {
    setBusy(true);
    setError("");
    try {
      const p = await api<Product>("/products", {
        method: "POST",
        body: JSON.stringify({
          ...draft,
          sku: draft.sku || null,
          description: draft.description || null,
          category: draft.category || null,
        }),
      });
      setCreate(false);
      setDraft({
        name: "",
        sku: "",
        description: "",
        category: "",
        unit: "piece",
      });
      setSelected(p.id);
      r.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (selected)
    return (
      <ProductDetail
        id={selected}
        context={context}
        onBack={() => {
          setSelected("");
          r.reload();
        }}
      />
    );
  return (
    <View style={{ gap: 18 }}>
      <Text role="heading" style={ui.sectionTitle}>
        Catalogue de produits
      </Text>
      <Card>
        <Input
          label="Rechercher un nom ou un SKU"
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => {
            setSearch(q.trim());
            setPage(1);
          }}
        />
        <Button
          secondary
          title="Rechercher"
          onPress={() => {
            setSearch(q.trim());
            setPage(1);
          }}
        />
        <Selector
          label="Statut"
          value={status}
          options={[
            { id: "ACTIVE", label: "Actifs" },
            { id: "ARCHIVED", label: "Archivés" },
            { id: "", label: "Tous" },
          ]}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        {can && (
          <Button
            title="Nouveau produit"
            onPress={() => {
              setCreate(true);
              setError("");
            }}
          />
        )}
      </Card>
      {!r.data ? (
        <LoadState error={r.error} retry={r.reload} />
      ) : (
        <>
          <Card>
            {r.data.items.map((p) => (
              <ListRow
                key={p.id}
                title={p.name}
                description={`${p.sku ?? "Sans SKU"} · ${p.unit}${p.shop?.name ? " · " + p.shop.name : ""}`}
                icon="box"
                trailing={
                  <Badge success={p.active}>
                    {p.active ? "Actif" : "Archivé"}
                  </Badge>
                }
                onPress={() => setSelected(p.id)}
              />
            ))}
            {!r.data.items.length && (
              <EmptyState
                title="Aucun produit à afficher"
                description="Les produits de votre périmètre apparaîtront ici."
                icon="box"
              />
            )}
            <Button secondary title="Actualiser" onPress={r.reload} />
          </Card>
          <Pager page={page} total={r.data.total} setPage={setPage} />
        </>
      )}
      <Sheet
        open={create}
        onClose={() => {
          if (!busy) setCreate(false);
        }}
        title="Nouveau produit"
      >
        {[
          ["name", "Nom du produit"],
          ["sku", "SKU (facultatif)"],
          ["category", "Catégorie (facultative)"],
          ["unit", "Unité de gestion"],
          ["description", "Description"],
        ].map(([key, label]) => (
          <Input
            key={key}
            label={label!}
            value={draft[key as keyof typeof draft]}
            multiline={key === "description"}
            onChangeText={(value) => setDraft((v) => ({ ...v, [key!]: value }))}
          />
        ))}
        <Text style={ui.body}>
          Les quantités seront reçues séparément par les agences lors d’un
          dépôt.
        </Text>
        {!!error && <ErrorMessage message={error} />}
        <Button
          title="Créer le produit"
          busy={busy}
          onPress={() => void save()}
        />
      </Sheet>
    </View>
  );
}
