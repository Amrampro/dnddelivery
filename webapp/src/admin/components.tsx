import { Link } from "react-router-dom";
import { Badge, DataTable, EmptyState } from "../design/ui";
import {
  actionLabels,
  companyBase,
  dateLabel,
  type Audit,
  type Company,
} from "./types";
export function CompanyStatus({ status }: { status: Company["status"] }) {
  return (
    <Badge
      tone={
        status === "ACTIVE"
          ? "success"
          : status === "SUSPENDED"
            ? "danger"
            : "neutral"
      }
    >
      {
        {
          ACTIVE: "Active",
          INACTIVE: "Désactivée",
          SUSPENDED: "Suspendue",
          ARCHIVED: "Archivée",
        }[status]
      }
    </Badge>
  );
}
export function CompanyTable({ companies }: { companies: Company[] }) {
  return companies.length ? (
    <DataTable
      caption="Entreprises de livraison"
      columns={[
        "Entreprise",
        "Référence",
        "Ville / pays",
        "Statut",
        "Création",
        "",
      ]}
      rows={companies.map((c) => [
        <Link className="admin-company-name" to={`${companyBase}/${c.id}`}>
          {c.name}
          <small>{c.email}</small>
        </Link>,
        c.reference,
        `${c.city} · ${c.countryCode}`,
        <CompanyStatus status={c.status} />,
        dateLabel(c.createdAt),
        <Link className="ds-button ds-ghost" to={`${companyBase}/${c.id}`}>
          Consulter
        </Link>,
      ])}
    />
  ) : (
    <EmptyState
      title="Aucune entreprise dans cette sélection."
      description="Modifiez les filtres ou enregistrez votre première entreprise."
      action={
        <Link className="ds-button ds-primary" to={`${companyBase}/nouvelle`}>
          Créer une entreprise
        </Link>
      }
    />
  );
}
export function ActivityTable({ items }: { items: Audit[] }) {
  return items.length ? (
    <DataTable
      caption="Journal administratif"
      columns={["Action", "Entreprise", "Auteur", "Date", "Informations"]}
      rows={items.map((a) => [
        actionLabels[a.action] ?? a.action,
        a.company && a.companyId ? (
          <Link to={`${companyBase}/${a.companyId}`}>{a.company.name}</Link>
        ) : (
          "—"
        ),
        a.actor?.fullName ?? "—",
        dateLabel(a.createdAt),
        a.metadata?.reason
          ? String(a.metadata.reason)
          : Array.isArray(a.metadata?.changedFields)
            ? a.metadata.changedFields.join(", ")
            : "—",
      ])}
    />
  ) : (
    <EmptyState
      title="Aucune action administrative à afficher."
      description="Les opérations enregistrées apparaîtront dans ce journal."
    />
  );
}
