import { useState } from "react";
import type { Workspace } from "../auth/types";
import { Button, Field, Select } from "../design/ui";
import type { StockOptions } from "./types";
import type { StockFilters } from "./stockLogic";
import { StockPicker } from "./StockComponents";
export function StockFilterBar({
  context,
  options,
  filters,
  change,
  stock = false,
}: {
  context: Workspace;
  options: StockOptions;
  filters: StockFilters;
  change: (f: StockFilters) => void;
  stock?: boolean;
}) {
  const [productSearch, setProductSearch] = useState(false);
  const set = (key: keyof StockFilters, value: string | boolean) =>
    change({ ...filters, [key]: value, page: 1 });
  return (
    <>
      <div className="stock-filters">
        <Field
          label="Rechercher une référence ou un produit"
          value={filters.q}
          onChange={(e) => set("q", e.target.value)}
        />
        {context.scope === "SHOP" && (
          <Select
            label="Entreprise de conservation"
            value={filters.companyId}
            onChange={(e) =>
              change({
                ...filters,
                companyId: e.target.value,
                agencyId: "",
                page: 1,
              })
            }
          >
            <option value="">Tous mes transporteurs</option>
            {options.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
        <Select
          label="Agence"
          value={filters.agencyId}
          disabled={context.scope === "AGENCY"}
          onChange={(e) => set("agencyId", e.target.value)}
        >
          <option value="">Toutes les agences autorisées</option>
          {options.agencies
            .filter(
              (a) =>
                !filters.companyId ||
                !a.companyId ||
                a.companyId === filters.companyId,
            )
            .map((a) => (
              <option key={a.id} value={a.id}>
                {context.scope === "SHOP" && !filters.companyId
                  ? `${options.companies.find((c) => c.id === a.companyId)?.name ?? "Transporteur"} · ${a.name}`
                  : a.name}
              </option>
            ))}
        </Select>
        {context.scope !== "SHOP" && (
          <Select
            label="Boutique propriétaire"
            value={filters.shopId}
            onChange={(e) =>
              change({
                ...filters,
                shopId: e.target.value,
                productId: "",
                page: 1,
              })
            }
          >
            <option value="">Toutes les boutiques</option>
            {options.shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
        {stock && (
          <Select
            label="État du stock"
            value={filters.status}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="">Tous les états</option>
            <option value="AVAILABLE">Disponible</option>
            <option value="LOW">Stock faible</option>
            <option value="OUT_OF_STOCK">Rupture</option>
          </Select>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => setProductSearch(!productSearch)}
        >
          {filters.productId
            ? "Changer le produit filtré"
            : "Filtrer par produit"}
        </Button>
      </div>
      {productSearch && (
        <StockPicker
          endpoint={`/products${filters.shopId ? `?shopId=${filters.shopId}` : ""}`}
          label="Produit concerné"
          value={filters.productId}
          change={(v) => set("productId", v)}
        />
      )}
    </>
  );
}
