import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, Input, Selector, ErrorMessage, ui } from "../design/ui";
import { api } from "../auth/client";
import type { Workspace } from "../auth/types";
import { localKey } from "../stocks/ui";
import { useDeliveryData } from "./useDeliveryData";
import {
  deliveryActionDefinitions,
  deliveryActionName,
  deliveryActionRequest,
  initialActionValues,
} from "../../../shared/delivery-actions";
import {
  incidentReasons,
  type DeliveryMission,
  type DeliveryOptions,
  type EligibleDriver,
  type PendingHandover,
} from "../../../shared/deliveries";
export function DeliveryActionForm({
  mission,
  code,
  handover,
  context,
  options,
  onDone,
  onClose,
  scrollToTop,
}: {
  mission?: DeliveryMission;
  code: string;
  handover?: PendingHandover;
  context: Workspace;
  options?: DeliveryOptions;
  onDone: () => void;
  onClose: () => void;
  scrollToTop: () => void;
}) {
  const [m] = useState(() => mission),
    [h] = useState(() => handover),
    key = useRef(localKey()),
    lock = useRef(false),
    [values, setValues] = useState(() => initialActionValues(m)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const action = code.split(":")[0]!,
    def = deliveryActionDefinitions[action]!,
    needsDriver =
      def.driver || (def.decision && values.decision === "REASSIGN"),
    needsAgency = def.agency || (def.decision && values.decision === "RETURN"),
    drivers = useDeliveryData<EligibleDriver[]>(
      needsDriver && m
        ? `/deliveries/eligible-drivers?agencyId=${m.agencyId}`
        : null,
    );
  const agencies = (options?.destinationAgencies ?? []).filter(
      (a) =>
        (!m || a.companyId === m.companyId) &&
        (action === "TRANSFER_CREATE"
          ? a.id !== m?.agencyId &&
            (!m?.parcelReturn || a.id === m.parcelReturn.agencyId)
          : m?.order.type === "FROM_STOCK"
            ? a.id === m.order.agencyId
            : true),
    ),
    eligible = (drivers.data ?? []).filter(
      (d) =>
        d.eligible &&
        (!["REASSIGN", "RESOLVE_INCIDENT"].includes(action) ||
          d.id !== m?.courierId),
    );
  async function submit() {
    if (lock.current) return;
    try {
      const request = deliveryActionRequest(m, code, values, key.current, h);
      lock.current = true;
      setBusy(true);
      setError("");
      await api(request.path, {
        method: "POST",
        body: JSON.stringify(request.body),
      });
      onDone();
    } catch (e) {
      setError(
        `${(e as Error).message} La saisie est conservée. En cas de coupure, actualisez la mission pour vérifier son état avant de réessayer.`,
      );
      scrollToTop();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={ui.stack}>
      <Button
        secondary
        disabled={busy}
        title="Revenir à la mission"
        onPress={onClose}
      />
      <Text style={ui.kicker}>CONFIRMATION D’UNE OPÉRATION PHYSIQUE</Text>
      <Text role="heading" style={ui.sectionTitle}>
        {deliveryActionName(code)}
      </Text>
      {!!error && <ErrorMessage message={error} />}
      <Card>
        <View style={ui.stack}>
          <Text style={ui.body}>{def.description}</Text>
          <Text style={ui.sectionTitle}>
            {m?.order.publicNumber ?? h?.publicNumber}
          </Text>
          {!!h && (
            <Text style={ui.body}>
              Remis par {h.fromName} · {h.agencyName}
              {"\n"}
              {h.reason}
            </Text>
          )}
        </View>
      </Card>
      <Card>
        <View style={ui.stack}>
          {def.decision && (
            <>
              <Selector
                label="Incident à traiter"
                value={values.incidentId}
                disabled={busy}
                options={(m?.incidents ?? [])
                  .filter((i) => i.status === "OPEN")
                  .map((i) => ({
                    id: i.id,
                    label: incidentReasons[i.kind] ?? i.kind,
                    description: new Date(i.createdAt).toLocaleString("fr-FR"),
                  }))}
                onChange={(incidentId) =>
                  setValues((v) => ({ ...v, incidentId }))
                }
              />
              <Selector
                label="Décision"
                value={values.decision}
                disabled={busy}
                options={[
                  { id: "RETRY", label: "Autoriser une nouvelle tentative" },
                  {
                    id: "REASSIGN",
                    label: "Réaffecter avec remise de garde si nécessaire",
                  },
                  { id: "RETURN", label: "Demander le retour à l’agence" },
                  {
                    id: "NOTE",
                    label: "Clore cet incident avec une observation",
                  },
                ]}
                onChange={(decision) => setValues((v) => ({ ...v, decision }))}
              />
            </>
          )}
          {needsDriver && (
            <>
              <Selector
                label={
                  action === "TRANSFER_CREATE"
                    ? "Agent de transport"
                    : "Livreur éligible"
                }
                value={values.courierId}
                disabled={busy}
                options={eligible.map((d) => ({
                  id: d.id,
                  label: d.fullName,
                  description: `Disponible · ${d.activeMissions} mission(s) active(s)`,
                }))}
                onChange={(courierId) =>
                  setValues((v) => ({ ...v, courierId }))
                }
              />
              {drivers.error && (
                <ErrorMessage message={drivers.error} retry={drivers.reload} />
              )}
              <Text style={ui.body}>
                La disponibilité déclarée et la charge de travail sont
                distinctes. Un livreur disponible peut recevoir plusieurs
                missions.
              </Text>
              {drivers.data?.map((d) => (
                <Text key={d.id} style={ui.body}>
                  {d.fullName} · {d.eligible ? "Disponible" : "Non éligible"} ·{" "}
                  {d.activeMissions} mission(s)
                </Text>
              ))}
            </>
          )}
          {needsAgency && (
            <Selector
              label={
                action === "TRANSFER_CREATE"
                  ? "Agence destinataire"
                  : "Agence de retour"
              }
              value={values.agencyId}
              disabled={busy}
              options={agencies.map((a) => ({ id: a.id, label: a.name }))}
              onChange={(agencyId) => setValues((v) => ({ ...v, agencyId }))}
            />
          )}
          {(def.failure || def.incident) && (
            <Selector
              label="Motif structuré"
              value={values.kind}
              disabled={busy}
              options={Object.entries(incidentReasons).map(([id, label]) => ({
                id,
                label,
              }))}
              onChange={(kind) => setValues((v) => ({ ...v, kind }))}
            />
          )}
          {def.condition && (
            <Selector
              label="État du colis à la réception"
              value={values.condition}
              disabled={busy}
              options={[
                { id: "GOOD", label: "Intact et conforme" },
                { id: "DAMAGED", label: "Endommagé · à isoler" },
                ...(action !== "RETURN_RECEIVE"
                  ? [{ id: "REFUSED", label: "Réception refusée" }]
                  : []),
              ]}
              onChange={(condition) =>
                setValues((v) => ({
                  ...v,
                  condition,
                  restock: condition === "GOOD" ? v.restock : false,
                }))
              }
            />
          )}
          {def.incident && (
            <Selector
              label="Incident bloquant"
              value={String(values.blocking)}
              disabled={busy}
              options={[
                { id: "false", label: "Observation · mission poursuivie" },
                {
                  id: "true",
                  label: "Bloquant · décision du responsable nécessaire",
                },
              ]}
              onChange={(value) =>
                setValues((v) => ({ ...v, blocking: value === "true" }))
              }
            />
          )}
          {def.restock &&
            m?.order.type === "FROM_STOCK" &&
            context.permissions.includes("deliveries.returns") &&
            context.subscriptionAccess?.valid !== false && (
              <Selector
                label="Réintégration des marchandises"
                value={String(values.restock)}
                disabled={busy || values.condition !== "GOOD"}
                options={[
                  { id: "false", label: "Réception physique uniquement" },
                  {
                    id: "true",
                    label: "Réintégrer les articles contrôlés intacts",
                  },
                ]}
                onChange={(value) =>
                  setValues((v) => ({ ...v, restock: value === "true" }))
                }
              />
            )}
          <Input
            label={
              action === "RETURN_SHOP"
                ? "Représentant de la boutique et motif de remise"
                : def.reason
                  ? "Motif et observations"
                  : "Observation facultative"
            }
            editable={!busy}
            multiline
            maxLength={500}
            value={values.reason}
            onChangeText={(reason) => setValues((v) => ({ ...v, reason }))}
          />
        </View>
      </Card>
      <Button
        busy={busy}
        title="Confirmer l’opération"
        onPress={() => void submit()}
      />
    </View>
  );
}
