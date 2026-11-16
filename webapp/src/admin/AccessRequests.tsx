import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../auth/client";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Select,
  Skeleton,
  Stat,
} from "../design/ui";
import { useResource } from "./useResource";
type Request = {
  id: string;
  name: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  countryCode: string;
  address: string;
  description: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason: string | null;
  version: number;
  companyId: string | null;
  createdAt: string;
  reviewedAt: string | null;
};
type Result = {
  items: Request[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
};
const labels = {
  PENDING: "En attente",
  APPROVED: "Acceptée",
  REJECTED: "Refusée",
};
export function AccessRequestSummary() {
  const resource = useResource<Result>(
    "/admin/access-requests?status=PENDING&page=1",
  );
  return (
    <Card title="Demandes des entreprises de livraison">
      {resource.error ? (
        <ErrorState message={resource.error} retry={resource.reload} />
      ) : !resource.data ? (
        <Skeleton />
      ) : (
        <>
          <div className="ws-stats">
            <Stat
              label="À examiner"
              value={resource.data.counts.PENDING}
              detail="Demandes en attente"
            />
            <Stat
              label="Acceptées"
              value={resource.data.counts.APPROVED}
              detail="Entreprises créées"
            />
            <Stat
              label="Refusées"
              value={resource.data.counts.REJECTED}
              detail="Demandes examinées"
            />
          </div>
          <Link
            className="ds-button ds-secondary"
            to="/portail/super-admin/demandes-acces"
          >
            Examiner les demandes
          </Link>
        </>
      )}
    </Card>
  );
}
export function AccessRequests() {
  const [status, setStatus] = useState("PENDING"),
    [page, setPage] = useState(1);
  const [decision, setDecision] = useState<{
    row: Request;
    value: "APPROVED" | "REJECTED";
  }>();
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  const resource = useResource<Result>(
    `/admin/access-requests?${new URLSearchParams({ ...(status ? { status } : {}), page: String(page) })}`,
  );
  return (
    <>
      <header className="ws-page-title">
        <div>
          <h1>Demandes d’accès entreprises de livraison</h1>
          <p>
            Vérifiez l’activité et les coordonnées du responsable avant
            d’accepter. Les inscriptions de boutiques suivent leur propre
            parcours.
          </p>
        </div>
      </header>
      {message && <p role="status">{message}</p>}
      <Select
        label="Statut des demandes"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          setPage(1);
        }}
      >
        <option value="">Tous les statuts</option>
        {Object.entries(labels).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </Select>
      {resource.error ? (
        <ErrorState message={resource.error} retry={resource.reload} />
      ) : !resource.data ? (
        <Skeleton />
      ) : (
        <>
          <div className="ws-stats">
            {Object.entries(labels).map(([key, label]) => (
              <Stat
                key={key}
                label={label}
                value={resource.data!.counts[key]}
                detail="Toutes les demandes"
              />
            ))}
          </div>
          {!resource.data.items.length && (
            <EmptyState
              title="Aucune demande dans cette sélection."
              description="Les demandes envoyées depuis le formulaire public apparaissent ici."
            />
          )}
          {resource.data.items.map((row) => (
            <Card key={row.id} title={row.name}>
              <p>
                <strong>Entreprise de livraison · {labels[row.status]}</strong>
              </p>
              <p>
                Responsable : {row.fullName} · {row.email} · {row.phone}
              </p>
              <p>
                {row.address} · {row.city} · {row.countryCode}
              </p>
              {row.description && <p>{row.description}</p>}
              <p>Reçue le {new Date(row.createdAt).toLocaleString("fr-FR")}</p>
              {row.reason && (
                <p>
                  Décision : {row.reason}{" "}
                  {row.reviewedAt &&
                    `— ${new Date(row.reviewedAt).toLocaleString("fr-FR")}`}
                </p>
              )}
              {row.companyId && (
                <Link
                  className="ds-button ds-secondary"
                  to={`/portail/super-admin/entreprises/${row.companyId}`}
                >
                  Ouvrir l’entreprise et ses invitations
                </Link>
              )}
              {row.status === "PENDING" && (
                <div className="admin-toolbar">
                  <Button
                    onClick={() => {
                      setDecision({ row, value: "APPROVED" });
                      setReason("");
                      setError("");
                    }}
                  >
                    Accepter la demande
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setDecision({ row, value: "REJECTED" });
                      setReason("");
                      setError("");
                    }}
                  >
                    Refuser
                  </Button>
                </div>
              )}
            </Card>
          ))}
          <div className="admin-toolbar">
            <Button
              variant="secondary"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Précédent
            </Button>
            <span>
              Page {page} · {resource.data.total} demande(s)
            </span>
            <Button
              variant="secondary"
              disabled={page * 15 >= resource.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </Button>
          </div>
        </>
      )}
      <Dialog
        open={!!decision}
        title={
          decision?.value === "APPROVED"
            ? "Accepter cette entreprise de livraison ?"
            : "Refuser cette demande ?"
        }
        onClose={() => {
          if (!busy) setDecision(undefined);
        }}
      >
        <p>
          {decision?.row.name} — {decision?.row.fullName} ({decision?.row.email}
          )
        </p>
        {decision?.value === "APPROVED" && (
          <p>
            L’entreprise sera créée et activée. Le responsable recevra une
            invitation, ou sera associé à son compte existant si cette adresse
            est déjà enregistrée. Vérifiez son identité avant de confirmer.
          </p>
        )}
        <Field
          label="Motif de la décision"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={3}
          maxLength={500}
          required
        />
        {error && <p role="alert">{error}</p>}
        <Button
          disabled={busy || reason.trim().length < 3}
          busy={busy}
          onClick={async () => {
            if (!decision || lock.current) return;
            lock.current = true;
            setBusy(true);
            setError("");
            try {
              const result = await api<{ invitationDelivery: string | null }>(
                `/admin/access-requests/${decision.row.id}/decision`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    version: decision.row.version,
                    decision: decision.value,
                    reason,
                  }),
                },
              );
              setMessage(
                decision.value === "REJECTED"
                  ? "Demande refusée. Aucun accès créé."
                  : result.invitationDelivery === "FAILED"
                    ? "Entreprise créée, mais l’envoi de l’invitation a échoué. Ouvrez sa fiche, puis renvoyez l’invitation depuis l’onglet Invitations."
                    : result.invitationDelivery === "SENT"
                      ? "Entreprise créée et invitation envoyée au responsable."
                      : "Entreprise créée et accès ajouté au compte existant du responsable.",
              );
              setDecision(undefined);
              resource.reload();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          Confirmer la décision
        </Button>
      </Dialog>
    </>
  );
}
