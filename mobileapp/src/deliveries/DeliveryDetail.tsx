import { useState } from "react";
import { ConfirmationScreen } from "../confirmation/ConfirmationScreen";
import { Linking, Text, View } from "react-native";
import { Button, Card, Badge, ErrorMessage, ui } from "../design/ui";
import { LoadState, Pager, date } from "../stocks/ui";
import { useDeliveryData } from "./useDeliveryData";
import type { Workspace } from "../auth/types";
import { OrderFinanceSummary } from "../finance/FinanceScreen";
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
export function DeliveryDetail({
  id,
  context,
  options,
  onBack,
  scrollToTop,
}: {
  id: string;
  context: Workspace;
  options?: DeliveryOptions;
  onBack: () => void;
  scrollToTop: () => void;
}) {
  const r = useDeliveryData<DeliveryMission>(`/deliveries/${id}`),
    [action, setAction] = useState<string>(),
    [confirmationOpen, setConfirmationOpen] = useState(false),
    [page, setPage] = useState(1),
    [mapError, setMapError] = useState(""),
    history = useDeliveryData<DeliveryPage<DeliveryHistoryEvent>>(
      `/deliveries/${id}/history?page=${page}`,
    ),
    m = r.data;
  async function navigate(address: string) {
    try {
      setMapError("");
      await Linking.openURL(navigationLink(address));
    } catch {
      setMapError("Impossible d’ouvrir l’application de navigation.");
    }
  }
  if (!m)
    return (
      <View style={ui.stack}>
        <Button secondary title="Retour aux missions" onPress={onBack} />
        <LoadState error={r.error} retry={r.reload} />
      </View>
    );
  if (confirmationOpen)
    return (
      <ConfirmationScreen
        id={id}
        orderId={m.order.id}
        context={context}
        onBack={() => {
          setConfirmationOpen(false);
          scrollToTop();
        }}
        onChanged={() => {
          r.reload();
          history.reload();
        }}
        scrollToTop={scrollToTop}
      />
    );
  if (action)
    return (
      <DeliveryActionForm
        key={action}
        mission={m}
        code={action}
        context={context}
        options={options}
        onClose={() => {
          setAction(undefined);
          scrollToTop();
        }}
        scrollToTop={scrollToTop}
        onDone={() => {
          setAction(undefined);
          r.reload();
          history.reload();
          scrollToTop();
        }}
      />
    );
  return (
    <View style={ui.stack}>
      <Button secondary title="Retour aux missions" onPress={onBack} />
      {context.permissions.some((code) =>
        [
          "delivery.proofs.read",
          "delivery.proofs.self.read",
          "shop.delivery.proofs.read",
        ].includes(code),
      ) && (
        <Button
          title="Confirmation et preuves de remise"
          onPress={() => {
            setConfirmationOpen(true);
            scrollToTop();
          }}
        />
      )}
      <Text style={ui.kicker}>SUIVI DU COLIS</Text>
      <Text role="heading" style={ui.sectionTitle}>
        {m.order.publicNumber}
      </Text>
      <Text style={ui.body}>
        {m.parcelReference ?? "Ancienne mission à examiner"}
      </Text>
      <Badge>{deliveryStates[m.status] ?? m.status}</Badge>
      <Badge>
        {deliveryPhases[m.phase ?? ""] ?? "Ancienne mission · lecture seule"}
      </Badge>
      <Text style={ui.body}>
        {m.company.name}
        {"\n"}
        {m.order.shopName} · {m.agency.name}
      </Text>
      <Text style={ui.body}>
        {r.syncing
          ? "Synchronisation…"
          : r.lastSync
            ? `Actualisé à ${new Date(r.lastSync).toLocaleTimeString("fr-FR")}`
            : "Synchronisation en attente"}
        {"\n"}Actualisation toutes les 30 secondes lorsque l’écran est actif.
      </Text>
      {r.error && <ErrorMessage message={r.error} retry={r.reload} />}
      <Button
        secondary
        title="Actualiser la mission"
        onPress={() => {
          r.reload();
          history.reload();
        }}
      />
      {!!m.actions.length && (
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>Vos prochaines actions</Text>
            {m.actions.map((code, index) => (
              <Button
                key={code}
                secondary={index !== 0}
                title={deliveryActionName(code)}
                onPress={() => {
                  setAction(code);
                  scrollToTop();
                }}
              />
            ))}
          </View>
        </Card>
      )}
      <Card>
        <View style={ui.stack}>
          <Text style={ui.kicker}>GARDE PHYSIQUE ACTUELLE</Text>
          <Text style={ui.sectionTitle}>
            {custodyLabels[m.custody.type ?? ""] ?? "À vérifier"}
          </Text>
          <Text style={ui.body}>
            {m.custody.type === "RECIPIENT" ? m.order.recipientName : m.custody.holder ?? m.custody.agencyName ?? m.order.shopName}
          </Text>
          <Text style={ui.body}>
            Livreur affecté :{" "}
            {m.courier?.fullName ??
              (m.kind === "shop"
                ? "Suivi assuré par le transporteur"
                : "Aucune affectation active")}
          </Text>
          <Text style={ui.body}>Prise en charge : {date(m.pickedUpAt)}</Text>
          {!!m.stockIssuedAt && (
            <Text style={ui.body}>
              Sortie de stock : {date(m.stockIssuedAt)}
            </Text>
          )}
        </View>
      </Card>
      <Card>
        <View style={ui.stack}>
          <Text style={ui.sectionTitle}>Destinataire</Text>
          <Text style={ui.sectionTitle}>{m.order.recipientName}</Text>
          <Text style={ui.body}>{m.order.recipientPhone}</Text>
          <Text style={ui.body}>
            {m.order.recipientAddress}, {m.order.recipientCity},{" "}
            {m.order.recipientCountry}
          </Text>
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
              <Text key={k} style={ui.body}>
                {
                  (
                    {
                      district: "Quartier",
                      landmark: "Repère",
                      accessInstructions: "Accès",
                      desiredDeliveryAt: "Date souhaitée",
                    } as Record<string, string>
                  )[k]
                }{" "}
                : {String(v)}
              </Text>
            ))}
          {m.kind !== "shop" && (
            <Button
              secondary
              title="Itinéraire dans Google Maps"
              onPress={() =>
                void navigate(
                  `${m.order.recipientAddress}, ${m.order.recipientCity}, ${m.order.recipientCountry}`,
                )
              }
            />
          )}
        </View>
      </Card>
      <Card>
        <View style={ui.stack}>
          <Text style={ui.sectionTitle}>
            {m.order.type === "FROM_STOCK"
              ? "Marchandises réservées"
              : "Collecte ponctuelle"}
          </Text>
          {m.order.pickup && (
            <>
              <Text style={ui.body}>
                {m.order.pickup.address}
                {"\n"}
                {m.order.pickup.contact} · {m.order.pickup.phone}
                {"\n"}
                {m.order.pickup.instructions}
              </Text>
              {m.kind !== "shop" && (
                <Button
                  secondary
                  title="Itinéraire de collecte dans Google Maps"
                  onPress={() => void navigate(m.order.pickup!.address)}
                />
              )}
            </>
          )}
          <Text style={ui.body}>{m.order.parcelDescription}</Text>
          {!!m.order.notes && <Text style={ui.body}>{m.order.notes}</Text>}
          {m.order.items.map((i) => (
            <View key={i.id} style={ui.stack}>
              <Text style={ui.sectionTitle}>
                {i.quantity} × {i.name}
              </Text>
              {i.reservations.map((res) => (
                <Text key={res.id} style={ui.body}>
                  {res.quantity} ·{" "}
                  {res.status === "ACTIVE"
                    ? "Réservée"
                    : res.status === "CONSUMED"
                      ? "Sortie physique confirmée"
                      : "Libérée"}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </Card>
      {!!mapError && <ErrorMessage message={mapError} />}
      <Card>
        <View style={ui.stack}>
          <Text style={ui.sectionTitle}>Encaissement attendu</Text>
          <Text style={ui.body}>
            {m.order.collectionRequired
              ? m.order.amountToCollect
                ? `${m.order.amountToCollect} ${m.order.currency}`
                : "Consultation du montant restreinte"
              : "Aucun encaissement · 0"}
          </Text>
          <Text style={ui.body}>
            Ce montant est une instruction. Consultez le suivi financier pour
            distinguer les déclarations et les réceptions confirmées.
          </Text>
          {m.phase === "AWAITING_PROOF" && (
            <Text style={ui.body}>
              Ouvrez Confirmation et preuves de remise pour vérifier le code,
              joindre les photos et clôturer la livraison.
            </Text>
          )}
        </View>
      </Card>
      {context.permissions.some((code) =>
        [
          "financial.supervise.read",
          "collections.self.read",
          "shop.collections.read",
        ].includes(code),
      ) && <OrderFinanceSummary orderId={m.order.id} context={context} />}
      {!!m.legs.length && (
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>Acheminements inter-agences</Text>
            {m.legs.map((l) => (
              <View key={l.id} style={ui.stack}>
                <Text style={ui.sectionTitle}>
                  {l.originName} → {l.destinationName}
                </Text>
                <Text style={ui.body}>
                  {l.returnedToOrigin
                    ? "Retour reçu à l’origine"
                    : l.status === "DRAFT"
                      ? "Préparé"
                      : l.status === "IN_TRANSIT"
                        ? "En transit"
                        : l.status === "CANCELLED"
                          ? "Abandonné"
                          : "Réceptionné"}
                  {l.transporterName ? ` · ${l.transporterName}` : ""}
                </Text>
                <Text style={ui.body}>
                  Départ : {date(l.dispatchedAt)}
                  {"\n"}Réception : {date(l.receivedAt)}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      )}
      {!!m.handovers.length && (
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>Remises de garde</Text>
            {m.handovers.map((h) => (
              <Text key={h.id} style={ui.body}>
                {h.targetName ?? "Livreur"} ·{" "}
                {h.status === "PENDING"
                  ? "Confirmation attendue"
                  : h.status === "ACCEPTED"
                    ? "Acceptée"
                    : "Refusée"}
                {"\n"}
                {h.reason} · {date(h.createdAt)}
              </Text>
            ))}
          </View>
        </Card>
      )}
      {!!m.incidents.length && (
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>Incidents</Text>
            {m.incidents.map((i) => (
              <View key={i.id} style={ui.stack}>
                <Text style={ui.label}>
                  {incidentReasons[i.kind] ?? i.kind} ·{" "}
                  {i.status === "OPEN" ? "À traiter" : "Traité"}
                </Text>
                <Text style={ui.body}>
                  {i.description}
                  {"\n"}
                  {date(i.createdAt)}
                  {i.blocking ? " · Bloquant" : ""}
                </Text>
                {!!i.resolutionReason && (
                  <Text style={ui.body}>Décision : {i.resolutionReason}</Text>
                )}
              </View>
            ))}
          </View>
        </Card>
      )}
      {!!m.attempts.length && (
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>Tentatives conservées</Text>
            {m.attempts.map((a, index) => (
              <Text key={a.id} style={ui.body}>
                Tentative {index + 1} · {date(a.createdAt)}
                {"\n"}
                {a.result === "FAILED"
                  ? (incidentReasons[a.reason ?? ""] ?? "Échec")
                  : "Confirmation en attente de preuve"}
                {a.notes ? ` · ${a.notes}` : ""}
              </Text>
            ))}
          </View>
        </Card>
      )}
      {m.parcelReturn && (
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>Retour du colis</Text>
            <Text style={ui.body}>{m.parcelReturn.reason}</Text>
            <Text style={ui.body}>
              Réception : {date(m.parcelReturn.receivedAt)} ·{" "}
              {m.parcelReturn.condition === "DAMAGED"
                ? "Colis isolé du disponible"
                : m.parcelReturn.condition === "GOOD"
                  ? "Contrôlé intact"
                  : "En attente"}
            </Text>
            <Text style={ui.body}>
              Réintégration : {date(m.parcelReturn.reintegratedAt)}
              {"\n"}Restitution boutique :{" "}
              {date(m.parcelReturn.returnedToShopAt)}
            </Text>
          </View>
        </Card>
      )}
      {!!m.assignments.length && (
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>Historique des affectations</Text>
            {m.assignments.map((a) => (
              <Text key={a.id} style={ui.body}>
                {a.courierName} ·{" "}
                {a.purpose === "TRANSPORT"
                  ? "Transport inter-agences"
                  : "Mission livreur"}
                {"\n"}
                {date(a.createdAt)} → {a.endedAt ? date(a.endedAt) : "En cours"}
              </Text>
            ))}
          </View>
        </Card>
      )}
      <Card>
        <View style={ui.stack}>
          <Text style={ui.sectionTitle}>Événements et chaîne de garde</Text>
          {history.error && (
            <ErrorMessage message={history.error} retry={history.reload} />
          )}
          {history.data?.items.map((e) => (
            <View key={e.id} style={ui.stack}>
              <Text style={ui.label}>
                {deliveryEvents[e.action] ?? "Événement logistique"}
              </Text>
              <Text style={ui.body}>
                {date(e.createdAt)}
                {e.actor ? ` · ${e.actor.fullName}` : ""}
              </Text>
              {e.fromPhase !== e.toPhase && (
                <Text style={ui.body}>
                  {deliveryPhases[e.fromPhase ?? ""] ?? "Création"} →{" "}
                  {deliveryPhases[e.toPhase ?? ""] ?? "Étape enregistrée"}
                </Text>
              )}
              {!!e.fromCustody && !!e.toCustody && (
                <Text style={ui.body}>
                  Garde : {custodyLabels[e.fromCustody.type] ?? "—"} →{" "}
                  {custodyLabels[e.toCustody.type] ?? "—"}
                </Text>
              )}
              {!!e.reason && <Text style={ui.body}>{e.reason}</Text>}
            </View>
          ))}
          <Pager
            page={page}
            size={20}
            total={history.data?.total ?? 0}
            setPage={setPage}
          />
        </View>
      </Card>
    </View>
  );
}
