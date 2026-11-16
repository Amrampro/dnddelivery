import { useState } from "react";
import { useResource } from "./useResource";
import {
  Card,
  DataTable,
  ErrorState,
  Pagination,
  Skeleton,
} from "../design/ui";
type User = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: string;
  customerEnabled: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
};
export function UserDirectory() {
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [kind, setKind] = useState("all"),
    [page, setPage] = useState(1);
  const r = useResource<{ items: User[]; total: number }>(
    `/admin/users?page=${page}&kind=${kind}&search=${encodeURIComponent(search)}`,
  );
  return (
    <Card title="Comptes de la plateforme">
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(query);
        }}
      >
        <label>
          Nom ou e-mail
          <input
            value={query}
            maxLength={160}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Type de compte
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Tous les utilisateurs</option>
            <option value="customer">Comptes clients</option>
          </select>
        </label>
        <button className="ds-button" type="submit">
          Rechercher
        </button>
      </form>
      {r.error ? (
        <ErrorState message={r.error} retry={r.reload} />
      ) : !r.data ? (
        <Skeleton rows={4} />
      ) : (
        <>
          <p>{r.data.total} compte(s)</p>
          <DataTable
            caption="Utilisateurs de la plateforme"
            columns={[
              "Nom",
              "E-mail",
              "Téléphone",
              "Espace client",
              "État",
              "Inscription",
            ]}
            rows={r.data.items.map((u) => [
              u.fullName,
              u.email,
              u.phone ?? "—",
              u.customerEnabled
                ? u.emailVerifiedAt
                  ? "Activé · e-mail vérifié"
                  : "À vérifier"
                : "Non activé",
              u.status === "ACTIVE" ? "Actif" : u.status,
              new Date(u.createdAt).toLocaleDateString("fr-FR"),
            ])}
          />
          <Pagination
            page={page}
            pages={Math.ceil(r.data.total / 20)}
            onChange={setPage}
          />
        </>
      )}
    </Card>
  );
}
