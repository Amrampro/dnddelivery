import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../auth/client";
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Pagination,
  Select,
  Skeleton,
} from "../design/ui";
import { useResource } from "./useResource";
import { CompanyStatus } from "./components";
import { ConfirmAction, type AdminAction } from "./ConfirmAction";
import { companyBase, dateLabel, type Page } from "./types";

const base = "/portail/super-admin/boutiques";
type Status = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "ARCHIVED";
interface Shop {
  id: string;
  name: string;
  reference: string;
  legalName: string | null;
  email: string;
  phone: string;
  address: string;
  city: string | null;
  countryCode: string | null;
  status: Status;
  version: number;
  createdAt: string;
}
interface Detail {
  shop: Shop;
  owners: {
    active: boolean;
    user: { id: string; fullName: string; email: string };
  }[];
  collaborations: {
    id: string;
    status: string;
    company: { id: string; name: string; reference: string };
  }[];
  history: {
    id: string;
    action: string;
    createdAt: string;
    actor: { fullName: string } | null;
    metadata: { reason?: string; from?: string; to?: string } | null;
  }[];
}
export function ShopAdmin({ id }: { id?: string }) {
  if (id && !/^[a-f0-9-]{36}$/i.test(id))
    return (
      <EmptyState
        title="Boutique introuvable."
        description="Revenez à la liste des boutiques."
      />
    );
  return id ? <ShopDetail id={id} /> : <ShopList />;
}
function ShopList() {
  const [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [filters, setFilters] = useState(""),
    [page, setPage] = useState(1);
  const r = useResource<Page<Shop>>(
    `/admin/shops?page=${page}&pageSize=15&${filters}`,
  );
  function search(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams({ q });
    if (status) params.set("status", status);
    setFilters(params.toString());
    setPage(1);
  }
  return (
    <>
      <header className="ws-page-title">
        <div>
          <span className="ws-eyebrow">ADMINISTRATION GLOBALE</span>
          <h1>Les boutiques de la plateforme.</h1>
          <p>
            Consultez leurs propriétaires, leurs agences de livraison et gérez
            leurs accès.
          </p>
        </div>
      </header>
      <Card>
        <form className="admin-filters" onSubmit={search}>
          <Field
            label="Nom, référence ou e-mail"
            value={q}
            maxLength={160}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select
            label="Statut"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Tous les statuts</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Désactivée</option>
            <option value="SUSPENDED">Suspendue</option>
            <option value="ARCHIVED">Supprimée (archivée)</option>
          </Select>
          <Button type="submit">Rechercher</Button>
        </form>
      </Card>
      <Card title={r.data ? `${r.data.total} boutique(s)` : "Boutiques"}>
        {r.error ? (
          <ErrorState message={r.error} retry={r.reload} />
        ) : !r.data ? (
          <Skeleton rows={5} />
        ) : (
          <>
            {r.data.items.length ? (
              <DataTable
                caption="Boutiques de la plateforme"
                columns={[
                  "Boutique",
                  "Référence",
                  "Ville / pays",
                  "Statut",
                  "Création",
                  "",
                ]}
                rows={r.data.items.map((shop) => [
                  <Link
                    to={`${base}/${shop.id}`}
                    className="admin-company-name"
                  >
                    {shop.name}
                    <small>{shop.email}</small>
                  </Link>,
                  shop.reference,
                  [shop.city, shop.countryCode].filter(Boolean).join(" · ") ||
                    "—",
                  <CompanyStatus status={shop.status} />,
                  dateLabel(shop.createdAt),
                  <Link
                    to={`${base}/${shop.id}`}
                    className="ds-button ds-ghost"
                  >
                    Gérer
                  </Link>,
                ])}
              />
            ) : (
              <EmptyState
                title="Aucune boutique dans cette sélection."
                description="Modifiez votre recherche ou les filtres."
              />
            )}
            <Pagination
              page={page}
              pages={Math.max(1, Math.ceil(r.data.total / 15))}
              onChange={setPage}
            />
          </>
        )}
      </Card>
    </>
  );
}
function ShopDetail({ id }: { id: string }) {
  const r = useResource<Detail>(`/admin/shops/${id}`),
    [action, setAction] = useState<AdminAction | null>(null),
    [notice, setNotice] = useState("");
  if (r.error) return <ErrorState message={r.error} retry={r.reload} />;
  if (!r.data) return <Skeleton rows={5} />;
  const { shop, owners, collaborations, history } = r.data;
  function change(status: Status) {
    const archive = status === "ARCHIVED";
    setAction({
      title: archive
        ? "Supprimer cette boutique ?"
        : status === "ACTIVE"
          ? "Réactiver cette boutique ?"
          : "Suspendre cette boutique ?",
      description: archive
        ? "La boutique sera supprimée des espaces utilisables et archivée. Ses accès seront bloqués et ses invitations en attente révoquées. Les comptes personnels, commandes et historiques seront conservés. Cette action n'est pas réversible depuis cette interface."
        : status === "ACTIVE"
          ? "Les membres autorisés retrouveront l'espace de la boutique. Les collaborations conservent leur propre statut."
          : "Tous les membres perdront l'accès à cet espace et la boutique ne pourra plus lancer de nouvelles opérations. Les commandes existantes et leurs historiques seront conservés.",
      reason: true,
      submit: (reason) =>
        api(`/admin/shops/${id}${archive ? "" : "/status"}`, {
          method: archive ? "DELETE" : "PATCH",
          body: JSON.stringify({
            version: shop.version,
            reason,
            ...(archive ? {} : { status }),
          }),
        }),
    });
  }
  const collaborationLabels: Record<string, string> = {
    ACTIVE: "Active",
    PENDING: "En attente",
    SUSPENDED: "Suspendue",
    REJECTED: "Refusée",
    ENDED: "Terminée",
  };
  return (
    <>
      <header className="ws-page-title">
        <div>
          <span className="ws-eyebrow">{shop.reference}</span>
          <h1>{shop.name}</h1>
          <Link to={base}>Toutes les boutiques</Link>
        </div>
        <CompanyStatus status={shop.status} />
      </header>
      {notice && (
        <p role="status" className="admin-notice">
          {notice}
        </p>
      )}
      <div className="ws-two-columns">
        <Card title="Informations de la boutique">
          <dl className="admin-details">
            {[
              ["Nom légal", shop.legalName],
              ["E-mail", shop.email],
              ["Téléphone", shop.phone],
              ["Adresse", shop.address],
              ["Ville", shop.city],
              ["Pays", shop.countryCode],
              ["Création", dateLabel(shop.createdAt)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title="Gestion des accès">
          {shop.status === "ARCHIVED" ? (
            <p>
              Cette boutique a été supprimée et archivée. Ses historiques
              restent consultables.
            </p>
          ) : (
            <>
              <p>
                Les décisions s'appliquent à cette boutique, quelle que soit son
                agence de livraison.
              </p>
              <div className="ds-actions">
                {shop.status !== "ACTIVE" && (
                  <Button onClick={() => change("ACTIVE")}>Réactiver</Button>
                )}
                {shop.status !== "SUSPENDED" && (
                  <Button
                    variant="secondary"
                    onClick={() => change("SUSPENDED")}
                  >
                    Suspendre
                  </Button>
                )}
                <Button variant="danger" onClick={() => change("ARCHIVED")}>
                  Supprimer la boutique
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
      <Card title="Propriétaires">
        <DataTable
          caption="Propriétaires de la boutique"
          columns={["Nom", "E-mail", "Affiliation"]}
          rows={owners.map((o) => [
            o.user.fullName,
            o.user.email,
            o.active ? "Active" : "Inactive",
          ])}
        />
      </Card>
      <Card title="Agences de livraison partenaires">
        {collaborations.length ? (
          <DataTable
            caption="Collaborations de la boutique"
            columns={["Entreprise de livraison", "Référence", "Collaboration"]}
            rows={collaborations.map((c) => [
              <Link to={`${companyBase}/${c.company.id}`}>
                {c.company.name}
              </Link>,
              c.company.reference,
              collaborationLabels[c.status] ?? c.status,
            ])}
          />
        ) : (
          <p>Aucune collaboration enregistrée.</p>
        )}
        {collaborations.length === 100 && (
          <p>Les 100 collaborations les plus récentes sont affichées.</p>
        )}
      </Card>
      <Card title="Historique récent de la boutique">
        {history.length ? (
          <DataTable
            caption="50 dernières actions"
            columns={["Action", "Auteur", "Date", "Motif"]}
            rows={history.map((h) => [
              h.action === "PLATFORM_SHOP_ARCHIVED"
                ? "Suppression et archivage"
                : h.action === "PLATFORM_SHOP_STATUS_CHANGED"
                  ? `Statut : ${h.metadata?.to === "ACTIVE" ? "active" : h.metadata?.to === "SUSPENDED" ? "suspendue" : "désactivée"}`
                  : h.action,
              h.actor?.fullName ?? "—",
              dateLabel(h.createdAt),
              h.metadata?.reason ?? "—",
            ])}
          />
        ) : (
          <p>Aucune action enregistrée.</p>
        )}
      </Card>
      {action && (
        <ConfirmAction
          action={action}
          close={() => setAction(null)}
          done={(message) => {
            setNotice(message);
            r.reload();
          }}
        />
      )}
    </>
  );
}
