import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Pagination,
  Skeleton,
} from "../design/ui";
import { useResource } from "./useResource";
import { ActivityTable } from "./components";
import {
  companyBase,
  dateLabel,
  invitationState,
  type Audit,
  type Invitation,
  type Page,
} from "./types";
import { UserLookup, type SelectedUser } from "./UserLookup";
export function GlobalHistory() {
  const [page, setPage] = useState(1),
    r = useResource<Page<Audit>>(`/admin/activity?page=${page}&pageSize=15`);
  return (
    <>
      <header className="ws-page-title">
        <div>
          <span className="ws-eyebrow">TRAÇABILITÉ</span>
          <h1>Le journal administratif.</h1>
          <p>Actions, auteurs et horodatages conservés par la plateforme.</p>
        </div>
      </header>
      <Card>
        {r.error ? (
          <ErrorState message={r.error} retry={r.reload} />
        ) : !r.data ? (
          <Skeleton rows={5} />
        ) : (
          <>
            <ActivityTable items={r.data.items} />
            <Pagination
              page={page}
              pages={Math.ceil(r.data.total / 15)}
              onChange={setPage}
            />
          </>
        )}
      </Card>
    </>
  );
}
export function GlobalInvitations() {
  const [page, setPage] = useState(1),
    r = useResource<Page<Invitation>>(
      `/admin/invitations?page=${page}&pageSize=15`,
    );
  return (
    <>
      <header className="ws-page-title">
        <div>
          <span className="ws-eyebrow">ADMINISTRATEURS D’ENTREPRISE</span>
          <h1>Les invitations.</h1>
          <p>
            Suivez l’activation des comptes et reprenez les envois depuis leur
            entreprise.
          </p>
        </div>
      </header>
      <Card>
        {r.error ? (
          <ErrorState message={r.error} retry={r.reload} />
        ) : !r.data ? (
          <Skeleton rows={5} />
        ) : (
          <>
            {r.data.items.length ? (
              <DataTable
                caption="Invitations des administrateurs"
                columns={[
                  "Destinataire",
                  "Entreprise",
                  "État",
                  "E-mail",
                  "Expiration",
                  "",
                ]}
                rows={r.data.items.map((i) => [
                  <span>
                    {i.fullName}
                    <small className="admin-block">{i.email}</small>
                  </span>,
                  i.company?.name ?? "—",
                  <Badge>{invitationState(i)}</Badge>,
                  <Badge
                    tone={i.deliveryStatus === "FAILED" ? "danger" : "neutral"}
                  >
                    {i.deliveryStatus === "FAILED"
                      ? "Échec"
                      : i.deliveryStatus === "SENT"
                        ? "Envoyé"
                        : "En attente"}
                  </Badge>,
                  dateLabel(i.expiresAt),
                  <Link
                    className="ds-button ds-secondary"
                    to={`${companyBase}/${i.companyId}/invitations`}
                  >
                    Gérer
                  </Link>,
                ])}
              />
            ) : (
              <EmptyState
                title="Aucune invitation enregistrée."
                description="Les invitations seront visibles après la création d’une entreprise ou l’ajout d’un administrateur."
              />
            )}
            <Pagination
              page={page}
              pages={Math.ceil(r.data.total / 15)}
              onChange={setPage}
            />
          </>
        )}
      </Card>
    </>
  );
}
export function GlobalUsers() {
  const [user, setUser] = useState<SelectedUser | null>(null);
  return (
    <>
      <header className="ws-page-title">
        <div>
          <span className="ws-eyebrow">UTILISATEURS ET ACCÈS</span>
          <h1>Retrouvez un compte existant.</h1>
          <p>
            Les comptes peuvent administrer plusieurs entreprises sans être
            dupliqués.
          </p>
        </div>
      </header>
      <Card title="Recherche sécurisée par adresse exacte">
        <UserLookup selected={user} onSelect={setUser} />
        <p className="ws-disclaimer">
          Pour associer ce compte, désigner le responsable principal ou retirer
          une affiliation, ouvrez la fiche de l’entreprise concernée.
        </p>
        <Link className="ds-button ds-secondary" to={companyBase}>
          Ouvrir les entreprises
        </Link>
      </Card>
    </>
  );
}
