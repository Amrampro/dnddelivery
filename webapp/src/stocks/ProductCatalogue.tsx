import { stockDate } from "./stockLogic";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Workspace } from "../auth/types";
import { api } from "../auth/client";
import { useResource } from "../admin/useResource";
import { ConfirmAction, type AdminAction } from "../admin/ConfirmAction";
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Select,
  Textarea,
} from "../design/ui";
import {
  StockFeedback,
  StockPager,
  StockResource,
  type Page,
} from "./StockComponents";
interface Product {
  id: string;
  shopId: string;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  unit: string;
  active: boolean;
  archivedAt: string | null;
  version: number;
  imageUrl: string | null;
  shop: { id: string; name: string; reference: string };
  createdAt: string;
  updatedAt: string;
}
function ProductImage({ url, name }: { url: string | null; name: string }) {
  const [value, setValue] = useState<{ url: string; src: string }>();
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    api<{ mime: string; image: string }>(url, { signal: controller.signal })
      .then((v) => {
        if (!controller.signal.aborted)
          setValue({ url, src: `data:${v.mime};base64,${v.image}` });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [url]);
  return value?.url === url ? (
    <img
      className="stock-product-image"
      src={value.src}
      alt={`Illustration ${name}`}
    />
  ) : null;
}
function ProductForm({
  product,
  done,
}: {
  product?: Product;
  done: (p: Product, message?: string) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const p = await api<Product>(
        product ? `/products/${product.id}` : "/products",
        {
          method: product ? "PATCH" : "POST",
          body: JSON.stringify({
            name: String(f.get("name")),
            sku: String(f.get("sku")) || null,
            description: String(f.get("description")) || null,
            category: String(f.get("category")) || null,
            unit: String(f.get("unit")),
            active: product?.active ?? true,
            ...(product ? { version: product.version } : {}),
          }),
        },
      );
      const image = f.get("image");
      if (image instanceof File && image.size) {
        try {
          const result = await api<Product>(`/products/${p.id}/image`, {
            method: "PUT",
            body: image,
            headers: {
              "Content-Type": image.type,
              "X-Product-Version": String(p.version),
            },
          });
          done(result);
          return;
        } catch (e) {
          done(
            p,
            `Produit enregistré. L’image doit être reprise : ${(e as Error).message}`,
          );
          return;
        }
      }
      done(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="stock-form" onSubmit={submit}>
      <div className="stock-form-grid">
        <Field
          label="Nom du produit"
          name="name"
          defaultValue={product?.name}
          required
          minLength={2}
          maxLength={200}
        />
        <Field
          label="Référence SKU facultative"
          name="sku"
          defaultValue={product?.sku ?? ""}
          maxLength={80}
          hint="Unique dans le catalogue de votre boutique."
        />
        <Field
          label="Catégorie facultative"
          name="category"
          defaultValue={product?.category ?? ""}
          maxLength={120}
        />
        <Select
          label="Unité de gestion"
          name="unit"
          defaultValue={product?.unit ?? "piece"}
        >
          {[
            ...new Set([
              "piece",
              "paire",
              "boite",
              "carton",
              "colis",
              ...(product?.unit ? [product.unit] : []),
            ]),
          ].map((v) => (
            <option key={v} value={v}>
              {{
                piece: "Pièce",
                paire: "Paire",
                boite: "Boîte",
                carton: "Carton",
                colis: "Colis",
              }[v] ?? v}
            </option>
          ))}
        </Select>
      </div>
      <Textarea
        label="Description"
        name="description"
        defaultValue={product?.description ?? ""}
        maxLength={2000}
      />
      <Field
        label="Image facultative"
        name="image"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hint="PNG, JPEG ou WebP, 2 Mo maximum."
      />
      <p className="stock-info">
        Les quantités sont toujours entières, quelle que soit l’unité choisie.
        L’unité d’un produit ayant déjà des mouvements ne peut plus être
        modifiée.
      </p>
      <StockFeedback error={error} />
      <Button type="submit" busy={busy}>
        {product ? "Enregistrer le produit" : "Créer le produit"}
      </Button>
    </form>
  );
}
export function ProductCatalogue({
  context,
  id,
}: {
  context: Workspace;
  id?: string;
}) {
  const can =
      context.scope === "SHOP" &&
      context.permissions.includes("shop.products.manage"),
    base = `/portail/${context.portal}/produits`;
  if (id === "nouveau")
    return can ? (
      <>
        <Link className="stock-back" to={base}>
          ← Mon catalogue
        </Link>
        <h1>Nouveau produit</h1>
        <Card>
          <NewProduct base={base} />
        </Card>
      </>
    ) : (
      <p>La création de produit n’est pas autorisée dans ce contexte.</p>
    );
  return id ? (
    <ProductDetail context={context} id={id} can={can} />
  ) : (
    <ProductList context={context} can={can} />
  );
}
function NewProduct({ base }: { base: string }) {
  const navigate = useNavigate(),
    [result, setResult] = useState<{ product: Product; message: string }>();
  return result ? (
    <>
      <StockFeedback notice={result.message} />
      <Link
        className="ds-button ds-primary"
        to={`${base}/${result.product.id}`}
      >
        Ouvrir le produit enregistré
      </Link>
    </>
  ) : (
    <ProductForm
      done={(p, message) =>
        message
          ? setResult({ product: p, message })
          : navigate(`${base}/${p.id}`)
      }
    />
  );
}
function ProductList({ context, can }: { context: Workspace; can: boolean }) {
  const [q, setQ] = useState(""),
    [status, setStatus] = useState("ACTIVE"),
    [page, setPage] = useState(1),
    r = useResource<Page<Product>>(
      `/products?q=${encodeURIComponent(q)}${status ? `&status=${status}` : ""}&page=${page}`,
    ),
    base = `/portail/${context.portal}/produits`;
  return (
    <>
      <div className="stock-heading">
        <div>
          <span className="eyebrow">CATALOGUE</span>
          <h1>
            {context.scope === "SHOP"
              ? "Mes produits"
              : "Produits des boutiques"}
          </h1>
          <p>
            Une référence commerciale, utilisable auprès de plusieurs
            agences de livraison.
          </p>
        </div>
        {can && (
          <Link className="ds-button ds-primary" to={`${base}/nouveau`}>
            Créer un produit
          </Link>
        )}
      </div>
      <div className="stock-filters">
        <Field
          label="Rechercher un produit ou un SKU"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label="État"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tous les produits</option>
          <option value="ACTIVE">Actifs</option>
          <option value="ARCHIVED">Archivés</option>
        </Select>
      </div>
      <StockResource {...r}>
        {r.data && (
          <>
            {r.data.items.length ? (
              <DataTable
                caption="Catalogue de produits"
                columns={["Produit", "SKU", "Boutique", "Unité", "État", ""]}
                rows={r.data.items.map((p) => [
                  <div className="admin-company-name">
                    <ProductImage url={p.imageUrl} name={p.name} />
                    <Link to={`${base}/${p.id}`}>{p.name}</Link>
                  </div>,
                  p.sku ?? "—",
                  p.shop.name,
                  p.unit,
                  <Badge tone={p.active ? "success" : "neutral"}>
                    {p.active ? "Actif" : "Archivé"}
                  </Badge>,
                  <Link to={`${base}/${p.id}`}>Consulter</Link>,
                ])}
              />
            ) : (
              <EmptyState
                title="Aucun produit dans cette sélection."
                description="Créez votre catalogue ou modifiez les filtres."
              />
            )}
            <StockPager
              page={page}
              total={r.data.total}
              size={r.data.size}
              change={setPage}
            />
          </>
        )}
      </StockResource>
    </>
  );
}
function ProductDetail({
  context,
  id,
  can,
}: {
  context: Workspace;
  id: string;
  can: boolean;
}) {
  const r = useResource<Product>(`/products/${id}`),
    [edit, setEdit] = useState(false),
    [notice, setNotice] = useState(""),
    [action, setAction] = useState<AdminAction | null>(null);
  return (
    <>
      <Link className="stock-back" to={`/portail/${context.portal}/produits`}>
        ← Catalogue
      </Link>
      <h1>Fiche produit</h1>
      <StockFeedback notice={notice} />
      <StockResource {...r}>
        {r.data && (
          <Card
            title={r.data.name}
            action={
              can && !edit ? (
                <Button variant="secondary" onClick={() => setEdit(true)}>
                  Modifier
                </Button>
              ) : undefined
            }
          >
            {edit ? (
              <>
                <ProductForm
                  product={r.data}
                  done={(_p, m) => {
                    setEdit(false);
                    setNotice(m ?? "Produit enregistré.");
                    r.reload();
                  }}
                />
                <Button variant="ghost" onClick={() => setEdit(false)}>
                  Annuler
                </Button>
              </>
            ) : (
              <>
                <ProductImage url={r.data.imageUrl} name={r.data.name} />
                <dl className="stock-details">
                  {[
                    ["Boutique propriétaire", r.data.shop.name],
                    ["SKU", r.data.sku],
                    ["Catégorie", r.data.category],
                    ["Unité", r.data.unit],
                    ["Description", r.data.description],
                    ["Création", stockDate(r.data.createdAt)],
                    ["Modification", stockDate(r.data.updatedAt)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
                <Badge tone={r.data.active ? "success" : "neutral"}>
                  {r.data.active ? "Actif" : "Archivé"}
                </Badge>
                {can && (
                  <div className="ds-actions">
                    <Button
                      variant={r.data.active ? "danger" : "secondary"}
                      onClick={() => {
                        const p = r.data!;
                        setAction({
                          title: p.active
                            ? "Archiver ce produit ?"
                            : "Réactiver ce produit ?",
                          description:
                            "Le catalogue et les anciens mouvements restent conservés. Cette action ne modifie aucune quantité de stock.",
                          submit: () =>
                            api(`/products/${id}`, {
                              method: "PATCH",
                              body: JSON.stringify({
                                name: p.name,
                                sku: p.sku,
                                description: p.description,
                                category: p.category,
                                unit: p.unit,
                                active: !p.active,
                                version: p.version,
                              }),
                            }),
                        });
                      }}
                    >
                      {r.data.active ? "Archiver" : "Réactiver"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
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
