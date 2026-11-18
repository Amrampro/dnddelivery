import { useState } from "react";
import {
  Card,
  DataTable,
  ErrorState,
  Pagination,
  Skeleton,
} from "../design/ui";
import { useResource } from "./useResource";

interface Entry {
  id: string;
  createdAt: string;
  action: string;
  result: string;
  actor: { id: string; fullName: string; email: string } | null;
  entityId: string | null;
  requestId?: string;
  method?: string;
  status?: number;
  errorType?: string;
  errorCode?: string;
  details?: Record<string, string | number>;
}
const labels: Record<string, string> = {
  LOGIN_SUCCESS: "Connexion réussie",
  LOGIN_FAILURE: "Connexion échouée",
  LOGOUT: "Déconnexion",
  TOKEN_REVOKED: "Session révoquée",
  API_AVAILABLE: "Contrôle de disponibilité réussi",
  API_UNAVAILABLE: "API ou dépendances indisponibles",
  PASSWORD_RESET: "Gestion du mot de passe",
  PERMISSIONS_CHANGED: "Contexte ou permissions modifiés",
  ACCESS_DENIED: "Accès refusé",
  API_STARTED: "API démarrée",
  API_STOPPING: "API en cours d’arrêt",
  DEPENDENCIES_AVAILABLE: "Authentification et MySQL disponibles",
  DEPENDENCIES_UNAVAILABLE: "Authentification ou MySQL indisponible",
  HTTP_SERVER_ERROR: "Erreur du serveur",
  JOB_COMPLETED: "Tâche terminée",
  JOB_FAILED: "Tâche échouée",
  JOB_PARTIAL_FAILURE: "Tâche terminée avec des échecs",
  BACKUP_COMPLETED: "Sauvegarde terminée",
  BACKUP_FAILED: "Sauvegarde échouée",
  RESTORE_VERIFIED: "Restauration vérifiée",
  RESTORE_FAILED: "Restauration échouée",
  SECURITY_LOG_UNAVAILABLE: "Enregistrement de sécurité indisponible",
};
const reasons: Record<string, string> = {
  invalid_credentials: "Identifiants incorrects ou compte indisponible",
  password_changed: "Mot de passe changé",
  token_consumed: "Mot de passe réinitialisé",
  device_revoked: "Session d’un appareil révoquée",
  logout_all: "Toutes les sessions révoquées",
  access_denied: "Autorisation ou session refusée",
  context_selected: "Environnement sélectionné",
  mail_delivery_failed: "Envoi du message de récupération échoué",
  refresh_reuse: "Réutilisation d’un jeton détectée",
  replay_detected: "Réutilisation d’un jeton détectée",
};
export function AdministrationLogs() {
  const [category, setCategory] = useState("security");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const params = new URLSearchParams({
    category,
    page: String(page),
    size: "20",
    search,
  });
  if (result) params.set("result", result);
  if (from) params.set("from", new Date(from + "T00:00:00").toISOString());
  if (to) params.set("to", new Date(to + "T23:59:59.999").toISOString());
  const resource = useResource<{ items: Entry[]; total: number }>(
    "/admin/logs?" + params,
  );
  function update(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }
  return (
    <>
      <header className="ws-page-title">
        <div>
          <h1>Logs</h1>
          <p>Connexions, sécurité et fonctionnement de la plateforme.</p>
        </div>
      </header>
      <Card>
        <div className="admin-filters admin-log-filters">
          <label>
            Journal
            <select
              value={category}
              onChange={(e) => update(setCategory, e.target.value)}
            >
              <option value="security">Connexions et sécurité</option>
              <option value="technical">Fonctionnement technique</option>
            </select>
          </label>
          <label>
            Rechercher
            <input
              type="search"
              placeholder={
                category === "security"
                  ? "Nom, e-mail ou identifiant"
                  : "Événement, référence ou identifiant"
              }
              value={search}
              onChange={(e) => update(setSearch, e.target.value)}
            />
          </label>
          <label>
            Résultat
            <select
              value={result}
              onChange={(e) => update(setResult, e.target.value)}
            >
              <option value="">Tous</option>
              <option value="SUCCESS">Réussite</option>
              <option value="FAILURE">Échec</option>
              <option value="INFO">Information</option>
            </select>
          </label>
          <label>
            Du
            <input
              type="date"
              value={from}
              onChange={(e) => update(setFrom, e.target.value)}
            />
          </label>
          <label>
            Au
            <input
              type="date"
              min={from}
              value={to}
              onChange={(e) => update(setTo, e.target.value)}
            />
          </label>
          <button type="button" onClick={resource.reload}>
            Actualiser
          </button>
        </div>
        {resource.error ? (
          <ErrorState message={resource.error} retry={resource.reload} />
        ) : !resource.data ? (
          <Skeleton rows={5} />
        ) : (
          <>
            <p>{resource.data.total} événement(s)</p>
            {!resource.data.items.length ? (
              <p>Aucun événement pour ces filtres.</p>
            ) : (
              <div className="admin-logs-table">
                <DataTable
                  caption="Événements de la plateforme"
                  columns={[
                    "Date",
                    "Événement et résultat",
                    "Personne concernée",
                    "Élément concerné",
                    "Détails",
                  ]}
                  rows={resource.data.items.map((e) => [
                    <span>
                      {new Date(e.createdAt).toLocaleString("fr-FR")}
                      <br />
                      <small>Événement {e.id}</small>
                    </span>,
                    <span>
                      {labels[e.action] ?? e.action}
                      <br />
                      <strong>
                        {{
                          SUCCESS: "Réussite",
                          FAILURE: "Échec",
                          INFO: "Information",
                        }[e.result] ?? e.result}
                      </strong>
                    </span>,
                    e.actor ? (
                      <span>
                        {e.actor.fullName}
                        <br />
                        {e.actor.email}
                        <br />
                        <small>Compte {e.actor.id}</small>
                      </span>
                    ) : (
                      <span>
                        {e.details?.attemptedEmail ||
                          (category === "technical"
                            ? "Système / ordonnanceur"
                            : "Personne non authentifiée")}
                        <br />
                        Identifiant de compte indisponible
                      </span>
                    ),
                    <span className="admin-log-reference">
                      {e.entityId ?? "Compte non identifié"}
                    </span>,
                    <details>
                      <summary>Voir les détails</summary>
                      {Object.entries(
                        e.details ?? {
                          method: e.method,
                          status: e.status,
                          requestId: e.requestId,
                        errorType: e.errorType,
                        errorCode: e.errorCode,
                        },
                      )
                        .filter(([, value]) => value !== undefined)
                        .map(([key, value]) => (
                          <div key={key}>
                            {(
                              {
                                reason: "Motif",
                                client: "Client",
                                scope: "Périmètre",
                                sessionId: "Session",
                                attemptedEmail: "E-mail saisi",
                                path: "Ressource",
                                method: "Méthode",
                                status: "Statut HTTP",
                                requestId: "Requête",
                              errorType: "Type d’erreur",
                              errorCode: "Code d’erreur",
                              } as Record<string, string>
                            )[key] ?? key}{" "}
                            ·{" "}
                            {key === "reason"
                              ? (reasons[String(value)] ?? value)
                              : value}
                          </div>
                        ))}
                    </details>,
                  ])}
                />
              </div>
            )}
            <Pagination
              page={page}
              pages={Math.ceil(resource.data.total / 20)}
              onChange={setPage}
            />
          </>
        )}
      </Card>
    </>
  );
}
