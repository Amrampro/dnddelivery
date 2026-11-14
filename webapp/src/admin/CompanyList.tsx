import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  ErrorState,
  Field,
  Pagination,
  Select,
  Skeleton,
} from "../design/ui";
import { CompanyTable } from "./components";
import { useResource } from "./useResource";
import { companyBase, type Company, type Page } from "./types";
export function CompanyList() {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [country, setCountry] = useState(""),
    [city, setCity] = useState(""),
    [sort, setSort] = useState("newest"),
    [filters, setFilters] = useState("sort=newest"),
    [page, setPage] = useState(1);
  const resource = useResource<Page<Company>>(
    `/admin/companies?${filters}&page=${page}&pageSize=15`,
  );
  function submit(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams({ q: query, sort });
    if (status) params.set("status", status);
    if (country) params.set("country", country.toUpperCase());
    if (city) params.set("city", city);
    setPage(1);
    setFilters(params.toString());
  }
  return (
    <>
      <header className="ws-page-title">
        <div>
          <span className="ws-eyebrow">RÉSEAU D’ENTREPRISES</span>
          <h1>Les entreprises de votre plateforme.</h1>
          <p>Recherchez, consultez et gérez chaque environnement.</p>
        </div>
        <Link className="ds-button ds-primary" to={`${companyBase}/nouvelle`}>
          Créer une entreprise
        </Link>
      </header>
      <Card>
        <form className="admin-filters" onSubmit={submit}>
          <Field
            label="Nom, référence ou e-mail"
            value={query}
            maxLength={160}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une entreprise…"
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
            <option value="ARCHIVED">Archivée</option>
          </Select>
          <Field
            label="Pays (2 lettres)"
            value={country}
            maxLength={2}
            onChange={(e) => setCountry(e.target.value)}
          />
          <Field
            label="Ville"
            value={city}
            maxLength={120}
            onChange={(e) => setCity(e.target.value)}
          />
          <Select
            label="Date de création"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="newest">Plus récentes</option>
            <option value="oldest">Plus anciennes</option>
          </Select>
          <Button type="submit">Appliquer</Button>
        </form>
      </Card>
      <Card
        title={
          resource.data
            ? `${resource.data.total} entreprise${resource.data.total > 1 ? "s" : ""}`
            : "Entreprises"
        }
      >
        {resource.error ? (
          <ErrorState message={resource.error} retry={resource.reload} />
        ) : !resource.data ? (
          <Skeleton rows={5} />
        ) : (
          <>
            <CompanyTable companies={resource.data.items} />
            <Pagination
              page={page}
              pages={Math.ceil(resource.data.total / 15)}
              onChange={setPage}
            />
          </>
        )}
      </Card>
    </>
  );
}
