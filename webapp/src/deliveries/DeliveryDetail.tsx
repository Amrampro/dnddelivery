import { useState } from "react";
import { ConfirmationPanel } from "../confirmation/ConfirmationPanel";
import {
  Button,
  Card,
  Badge,
  DataTable,
  ErrorState,
  Skeleton,
} from "../design/ui";
import { useDeliveryData } from "./useDeliveryData";
import type { Workspace } from "../auth/types";
import { OrderFinanceSummary } from "../finance/FinanceWorkspace";
import { DeliveryActionForm } from "./DeliveryActionForm";
import { deliveryActionName } from "../../../shared/delivery-actions";
import {
  deliveryPhases,
  deliveryStates,
  deliveryEvents,
  custodyLabels,
  incidentReasons,
  navigationLink,
  type DeliveryMission,
  type DeliveryOptions,
  type DeliveryPage,
  type DeliveryHistoryEvent,
} from "../../../shared/deliveries";
const date = (s: string | null) =>
  s ? new Date(s).toLocaleString("fr-FR") : "—";
export function DeliveryDetail({
  id,
  context,
  options,
  onBack,
}: {
  id: string;
  context: Workspace;
  options?: DeliveryOptions;
  onBack: () => void;
}) {
  const r = useDeliveryData<DeliveryMission>(`/deliveries/${id}`),
    [action, setAction] = useState<string>(),
    [page, setPage] = useState(1),
    history = useDeliveryData<DeliveryPage<DeliveryHistoryEvent>>(
      `/deliveries/${id}/history?page=${page}`,
    ),
    m = r.data;
  if (!m)
    return r.error ? (
      <>
        <Button variant="secondary" onClick={onBack}>
          Retour aux missions
        </Button>
        <ErrorState message={r.error} retry={r.reload} />
      </>
    ) : (
      <Skeleton />
    );
  return (
    <>
      <div className="stock-heading">
        <div>
          <span className="eyebrow">SUIVI DU COLIS</span>
          <h1 className="order-reference">{m.order.publicNumber}</h1>
          <p className="order-reference">
            {m.parcelReference ?? "Ancienne mission à examiner"}
          </p>
          <Badge>{deliveryStates[m.status] ?? m.status}</Badge>{" "}
          <Badge>
            {deliveryPhases[m.phase ?? ""] ??
              "Ancienne mission · lecture seule"}
          </Badge>
          <p>
            {m.company.name} · {m.order.shopName} · {m.agency.name}
          </p>
        </div>
        <Button variant="ghost" onClick={onBack}>
          Retour aux missions
        </Button>
      </div>
      <div className="delivery-sync">
        <span>
          {r.syncing
            ? "Synchronisation…"
            : r.error
              ? "Synchronisation en attente"
              : `Actualisé à ${date(r.lastSync ?? null)}`}
        </span>
        <span>
          Actualisation toutes les 30 secondes lorsque cette page est active.
        </span>
        <Button
          variant="ghost"
          onClick={() => {
            r.reload();
            history.reload();
          }}
        >
          Actualiser la mission
        </Button>
      </div>
      {r.error && <ErrorState message={r.error} retry={r.reload} />}
      <div className="delivery-grid">
        <Card>
          <span className="eyebrow">GARDE PHYSIQUE ACTUELLE</span>
          <h2>{custodyLabels[m.custody.type ?? ""] ?? "À vérifier"}</h2>
          <p>{m.custody.type === "RECIPIENT" ? m.order.recipientName : m.custody.holder ?? m.custody.agencyName ?? m.order.shopName}</p>
          <p>
            Livreur affecté :{" "}
            {m.courier?.fullName ??
              (m.kind === "shop"
                ? "Suivi assuré par l’agence de livraison"
                : "Aucune affectation active")}
          </p>
          <p>Prise en charge : {date(m.pickedUpAt)}</p>
          {m.stockIssuedAt && (
            <p>Sortie de stock confirmée : {date(m.stockIssuedAt)}</p>
          )}
        </Card>
        <Card>
          <h2>Destinataire</h2>
          <p>
            <strong>{m.order.recipientName}</strong> · {m.order.recipientPhone}
          </p>
          <p>
            {m.order.recipientAddress}, {m.order.recipientCity},{" "}
            {m.order.recipientCountry}
          </p>
          {Object.entries(m.order.recipientDetails ?? {})
            .filter(
              ([k, v]) =>
                v !== undefined &&
                [
                  "district",
                  "landmark",
                  "accessInstructions",
                  "desiredDeliveryAt",
                ].includes(k),
            )
            .map(([k, v]) => (
              <p key={k}>
                {
                  {
                    district: "Quartier",
                    landmark: "Repère",
                    accessInstructions: "Accès",
                    desiredDeliveryAt: "Date souhaitée",
                  }[k as "district"]
                }{" "}
                : {String(v)}
              </p>
            ))}
          {m.kind !== "shop" && (
            <a
              className="ds-button ds-secondary"
              href={navigationLink(
                `${m.order.recipientAddress}, ${m.order.recipientCity}, ${m.order.recipientCountry}`,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ouvrir l’itinéraire dans Google Maps
            </a>
          )}
        </Card>
        <Card>
          <h2>
            {m.order.type === "FROM_STOCK"
              ? "Marchandises réservées"
              : "Collecte ponctuelle"}
          </h2>
          {m.order.pickup && (
            <>
              <p>{m.order.pickup.address}</p>
              <p>
                {m.order.pickup.contact} · {m.order.pickup.phone}
              </p>
              <p>{m.order.pickup.instructions}</p>
              {m.kind !== "shop" && (
                <a
                  className="ds-button ds-secondary"
                  href={navigationLink(m.order.pickup.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Itinéraire de collecte dans Google Maps
                </a>
              )}
            </>
          )}
          <p>{m.order.parcelDescription}</p>
          <p>{m.order.notes}</p>
          {m.order.items.map((i) => (
            <p key={i.id}>
              <strong>
                {i.quantity} × {i.name}
              </strong>
              {i.reservations.map((res) => (
                <small key={res.id} className="admin-block">
                  {res.quantity} ·{" "}
                  {res.status === "ACTIVE"
                    ? "Réservée"
                    : res.status === "CONSUMED"
                      ? "Sortie physique confirmée"
                      : "Libérée"}
                </small>
              ))}
            </p>
          ))}
        </Card>
        <Card>
          <h2>Encaissement attendu</h2>
          <p>
            {m.order.collectionRequired
              ? m.order.amountToCollect
                ? `${m.order.amountToCollect} ${m.order.currency}`
                : "Consultation du montant restreinte"
              : "Aucun encaissement · 0"}
          </p>
          <p>
            Le montant attendu reste une instruction. Consultez le suivi
            financier pour distinguer les déclarations et réceptions confirmées.
          </p>
          {m.phase === "AWAITING_PROOF" && (
            <p className="delivery-proof-note">
              La remise définitive attend le service de preuve sécurisé du Bloc
              13.
            </p>
          )}
        </Card>
      </div>
      {context.permissions.some((code) =>
        [
          "financial.supervise.read",
          "collections.self.read",
          "shop.collections.read",
        ].includes(code),
      ) && <OrderFinanceSummary orderId={m.order.id} context={context} />}
      {context.permissions.some((code) =>
        [
          "delivery.proofs.read",
          "delivery.proofs.self.read",
          "shop.delivery.proofs.read",
        ].includes(code),
      ) && (
        <ConfirmationPanel
          id={id}
          orderId={m.order.id}
          context={context}
          onChanged={() => {
            r.reload();
            history.reload();
          }}
        />
      )}
      {!!m.actions.length && (
        <Card>
          <h2>Actions disponibles</h2>
          <div className="delivery-actions">
            {m.actions.map((code, index) => (
              <Button
                key={code}
                variant={index === 0 ? "primary" : "secondary"}
                onClick={() => setAction(code)}
              >
                {deliveryActionName(code)}
              </Button>
            ))}
          </div>
        </Card>
      )}
      {!!m.legs.length && (
        <Card>
          <h2>Acheminements inter-agences</h2>
          <DataTable
            caption="Étapes physiques du colis"
            columns={["Trajet", "Transport", "État", "Départ", "Réception"]}
            rows={m.legs.map((l) => [
              `${l.originName} → ${l.destinationName}${l.returnedToOrigin ? " · Retour à l’origine" : ""}`,
              l.transporterName ?? "Agence de livraison",
              l.status === "DRAFT"
                ? "Préparé"
                : l.status === "IN_TRANSIT"
                  ? "En transit"
                  : l.status === "CANCELLED"
                    ? "Abandonné"
                    : "Réceptionné",
              date(l.dispatchedAt),
              <div>
                {date(l.receivedAt)}
                <small className="admin-block">
                  {l.condition === "DAMAGED"
                    ? "Endommagé"
                    : l.condition === "GOOD"
                      ? "Intact"
                      : ""}
                </small>
              </div>,
            ])}
          />
        </Card>
      )}
      {!!m.handovers.length && (
        <Card>
          <h2>Remises de garde</h2>
          {m.handovers.map((h) => (
            <p key={h.id}>
              {h.targetName ?? "Livreur"} ·{" "}
              {h.status === "PENDING"
                ? "Confirmation physique attendue"
                : h.status === "ACCEPTED"
                  ? "Acceptée"
                  : "Refusée"}{" "}
              · {date(h.createdAt)}
              <br />
              {h.reason}
            </p>
          ))}
        </Card>
      )}
      {!!m.incidents.length && (
        <Card>
          <h2>Incidents</h2>
          {m.incidents.map((i) => (
            <div className="delivery-history-item" key={i.id}>
              <h3>
                {incidentReasons[i.kind] ?? i.kind} ·{" "}
                {i.status === "OPEN" ? "À traiter" : "Traité"}
              </h3>
              <p>{i.description}</p>
              <p>
                {date(i.createdAt)}
                {i.blocking ? " · Bloquant" : ""}
              </p>
              {i.resolutionReason && <p>Décision : {i.resolutionReason}</p>}
            </div>
          ))}
        </Card>
      )}
      {!!m.attempts.length && (
        <Card>
          <h2>Tentatives conservées</h2>
          {m.attempts.map((a, index) => (
            <p key={a.id}>
              Tentative {index + 1} · {date(a.createdAt)} ·{" "}
              {a.result === "FAILED"
                ? (incidentReasons[a.reason ?? ""] ?? "Échec")
                : "Confirmation de remise en attente"}
              {a.notes ? ` · ${a.notes}` : ""}
            </p>
          ))}
        </Card>
      )}
      {m.parcelReturn && (
        <Card>
          <h2>Retour du colis</h2>
          <p>{m.parcelReturn.reason}</p>
          <p>
            Réception : {date(m.parcelReturn.receivedAt)} ·{" "}
            {m.parcelReturn.condition === "DAMAGED"
              ? "Colis isolé du stock disponible"
              : m.parcelReturn.condition === "GOOD"
                ? "Contrôlé intact"
                : "En attente de contrôle"}
          </p>
          <p>Réintégration : {date(m.parcelReturn.reintegratedAt)}</p>
          <p>Restitution boutique : {date(m.parcelReturn.returnedToShopAt)}</p>
        </Card>
      )}
      {!!m.assignments.length && (
        <Card>
          <h2>Historique des affectations</h2>
          {m.assignments.map((a) => (
            <p key={a.id}>
              {a.courierName} ·{" "}
              {a.purpose === "TRANSPORT"
                ? "Transport inter-agences"
                : "Mission livreur"}
              <br />
              {date(a.createdAt)} → {a.endedAt ? date(a.endedAt) : "En cours"}
              {a.reason ? ` · ${a.reason}` : ""}
            </p>
          ))}
        </Card>
      )}
      <Card>
        <h2>Événements et chaîne de garde</h2>
        {history.error && (
          <ErrorState message={history.error} retry={history.reload} />
        )}
        <ol className="order-history">
          {history.data?.items.map((e) => (
            <li key={e.id}>
              <strong>
                {deliveryEvents[e.action] ?? "Événement logistique"}
              </strong>
              <span>
                {date(e.createdAt)}
                {e.actor ? ` · ${e.actor.fullName}` : ""}
              </span>
              {e.fromPhase !== e.toPhase && (
                <p>
                  {deliveryPhases[e.fromPhase ?? ""] ?? "Création"} →{" "}
                  {deliveryPhases[e.toPhase ?? ""] ?? "Étape enregistrée"}
                </p>
              )}
              {e.fromCustody && e.toCustody && (
                <p>
                  Garde : {custodyLabels[e.fromCustody.type] ?? "—"} →{" "}
                  {custodyLabels[e.toCustody.type] ?? "—"}
                </p>
              )}
              {e.reason && <p>{e.reason}</p>}
            </li>
          ))}
        </ol>
        <div className="delivery-actions">
          <Button
            variant="ghost"
            disabled={page === 1}
            onClick={() => setPage((n) => n - 1)}
          >
            Événements précédents
          </Button>
          <span>
            Page {page} · {history.data?.total ?? 0} événement(s)
          </span>
          <Button
            variant="ghost"
            disabled={page * 20 >= (history.data?.total ?? 0)}
            onClick={() => setPage((n) => n + 1)}
          >
            Événements suivants
          </Button>
        </div>
      </Card>
      {action && (
        <DeliveryActionForm
          key={action}
          mission={m}
          code={action}
          context={context}
          options={options}
          onClose={() => setAction(undefined)}
          onDone={() => {
            setAction(undefined);
            r.reload();
            history.reload();
          }}
        />
      )}
    </>
  );
}
