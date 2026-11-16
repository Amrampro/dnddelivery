import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../auth/client";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
} from "../design/ui";
import { useResource } from "./useResource";
import { ActivityTable, CompanyStatus } from "./components";
import { companyBase, dateLabel, type CompanyDetail as Detail } from "./types";
import { ConfirmAction, type AdminAction } from "./ConfirmAction";
import { Administrators } from "./Administrators";
function PrivateLogo({ url }: { url: string }) {
  const r = useResource<{ mime: string; image: string }>(url);
  return r.data ? (
    <img
      className="admin-company-logo"
      src={`data:${r.data.mime};base64,${r.data.image}`}
      alt="Logo de l’entreprise"
    />
  ) : r.error ? (
    <span>Logo indisponible</span>
  ) : (
    <span>Chargement du logo…</span>
  );
}
export function CompanyDetail({
  id,
  section,
}: {
  id: string;
  section?: string;
}) {
  const location = useLocation(),
    [notice, setNotice] = useState<string>(() => location.state?.notice ?? ""),
    [action, setAction] = useState<AdminAction | null>(null),
    r = useResource<Detail>(`/admin/companies/${id}`);
  if (r.error) return <ErrorState message={r.error} retry={r.reload} />;
  if (!r.data) return <Skeleton rows={5} />;
  const data = r.data,
    c = data.company;
  function status(status: "ACTIVE" | "INACTIVE" | "SUSPENDED") {
    setAction({
      title:
        status === "ACTIVE"
          ? "Activer cette entreprise ?"
          : status === "INACTIVE"
            ? "Désactiver cette entreprise ?"
            : "Suspendre cette entreprise ?",
      description:
        status === "ACTIVE"
          ? "Les utilisateurs affiliés retrouveront leur espace. Les opérations soumises à abonnement nécessitent aussi un abonnement actif."
          : "Les nouvelles requêtes d’accès à cette entreprise seront refusées. Les autres entreprises ne seront pas affectées.",
      reason: true,
      submit: (reason) =>
        api(`/admin/companies/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ version: c.version, status, reason }),
        }),
    });
  }
  return (
    <>
      <header className="ws-page-title">
        <div>
          <span className="ws-eyebrow">{c.reference}</span>
          <h1>{c.name}</h1>
          <p>
            {c.city} · {c.countryCode} · Créée le {dateLabel(c.createdAt)}
          </p>
        </div>
        <CompanyStatus status={c.status} />
      </header>
      <nav className="admin-tabs" aria-label="Fiche entreprise">
        {[
          ["", "Informations"],
          ["administrateurs", "Administrateurs"],
          ["invitations", "Invitations"],
          ["historique", "Historique"],
        ].map(([path, label]) => (
          <Link
            key={path}
            aria-current={(section ?? "") === path ? "page" : undefined}
            to={`${companyBase}/${id}${path ? "/" + path : ""}`}
          >
            {label}
          </Link>
        ))}
        <Link to={companyBase}>Toutes les entreprises</Link>
      </nav>
      {(c.status === "INACTIVE" || c.status === "SUSPENDED") && (
        <Card title="Accès de l'entreprise bloqué">
          <p>Le responsable peut se connecter à son compte mais ne peut pas ouvrir cet espace tant que l'entreprise est désactivée ou suspendue.</p>
          <Button onClick={() => status("ACTIVE")}>Activer l'entreprise</Button>
        </Card>
      )}
      {notice && (
        <div className="admin-notice" role="status">
          <p>{notice}</p>
          <Button variant="ghost" onClick={() => setNotice("")}>
            Fermer
          </Button>
        </div>
      )}
      {section === "administrateurs" || section === "invitations" ? (
        <Administrators
          detail={data}
          invitationsOnly={section === "invitations"}
          reload={r.reload}
          notify={setNotice}
        />
      ) : section === "historique" ? (
        <CompanyHistory id={id} />
      ) : (
        <>
          <div className="ws-two-columns">
            <Card
              title="Informations générales"
              action={
                <Link
                  className="ds-button ds-secondary"
                  to={`${companyBase}/${id}/modifier`}
                >
                  Modifier
                </Link>
              }
            >
              <dl className="admin-details">
                {[
                  ["Nom officiel", c.name],
                  ["Nom commercial", c.tradeName],
                  ["Référence immuable", c.reference],
                  ["Immatriculation", c.registrationNumber],
                  ["Description", c.description],
                  ["Dernière modification", dateLabel(c.updatedAt)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <Card title="Coordonnées et logo">
              <dl className="admin-details">
                {[
                  ["Adresse e-mail", c.email],
                  ["Téléphone", c.phone],
                  ["Siège", c.address],
                  ["Ville / pays", `${c.city} · ${c.countryCode}`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {c.logoUrl ? (
                <PrivateLogo url={`${c.logoUrl}?v=${c.version}`} />
              ) : (
                <p className="ws-disclaimer">
                  Aucun logo d’entreprise. L’identité DND Delivery reste
                  inchangée.
                </p>
              )}
              <Link
                className="ds-button ds-secondary"
                to={`${companyBase}/${id}/modifier`}
              >
                Ajouter ou remplacer le logo
              </Link>
            </Card>
          </div>
          <Card title="Statut administratif">
            <div className="ds-actions">
              <CompanyStatus status={c.status} />
              <Badge>Gestion indépendante de l’abonnement</Badge>
            </div>
            <p className="ws-disclaimer">
              {c.administrativeReason ??
                "Aucun motif administratif enregistré."}
            </p>
            <p className="ws-disclaimer">
              Dernier changement : {dateLabel(c.statusChangedAt)}
            </p>
            {c.status !== "ARCHIVED" && (
              <div className="ds-actions">
                {c.status !== "ACTIVE" && (
                  <Button onClick={() => status("ACTIVE")}>
                    Activer / réactiver
                  </Button>
                )}
                {c.status !== "INACTIVE" && (
                  <Button
                    variant="secondary"
                    onClick={() => status("INACTIVE")}
                  >
                    Désactiver
                  </Button>
                )}
                {c.status !== "SUSPENDED" && (
                  <Button variant="danger" onClick={() => status("SUSPENDED")}>
                    Suspendre
                  </Button>
                )}
              </div>
            )}
          </Card>
          <Card title="Responsables">
            <p>
              {data.admins.find((a) => a.userId === c.primaryAdminUserId)?.user
                .fullName ?? "Administrateur principal en attente d’activation"}
            </p>
            <Link
              className="ds-button ds-secondary"
              to={`${companyBase}/${id}/administrateurs`}
            >
              Gérer les administrateurs et invitations
            </Link>
          </Card>
          <Card title="Dernières actions">
            <ActivityTable items={data.history.items} />
          </Card>
          <div className="ws-module-grid">
            {[
              "Agences",
              "Partenaires",
              "Employés",
              "Abonnement",
              "Statistiques logistiques",
            ].map((label) => (
              <Card key={label} title={label}>
                <EmptyState
                  title="Disponible dans un prochain bloc."
                  description="Aucune donnée de démonstration n’est enregistrée."
                />
              </Card>
            ))}
          </div>
        </>
      )}
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
function CompanyHistory({ id }: { id: string }) {
  const [page, setPage] = useState(1),
    r = useResource<import("./types").Page<import("./types").Audit>>(
      `/admin/activity?companyId=${id}&page=${page}&pageSize=15`,
    );
  return (
    <Card title="Historique administratif">
      {r.error ? (
        <ErrorState message={r.error} retry={r.reload} />
      ) : !r.data ? (
        <Skeleton />
      ) : (
        <>
          <ActivityTable items={r.data.items} />
          <div className="ds-actions">
            <Button
              variant="secondary"
              disabled={page === 1}
              onClick={() => setPage((v) => v - 1)}
            >
              Précédent
            </Button>
            <span>
              {page} / {Math.max(1, Math.ceil(r.data.total / 15))}
            </span>
            <Button
              variant="secondary"
              disabled={page * 15 >= r.data.total}
              onClick={() => setPage((v) => v + 1)}
            >
              Suivant
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
