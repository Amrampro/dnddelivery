import { useRef, useState } from "react";
import {
  Button,
  Choice,
  Dialog,
  ErrorState,
  Field,
  Select,
} from "../design/ui";
import { api } from "../auth/client";
import type { Workspace } from "../auth/types";
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
}: {
  mission?: DeliveryMission;
  code: string;
  handover?: PendingHandover;
  context: Workspace;
  options?: DeliveryOptions;
  onDone: () => void;
  onClose: () => void;
}) {
  const [m] = useState(() => mission),
    [h] = useState(() => handover),
    key = useRef(crypto.randomUUID()),
    lock = useRef(false),
    [values, setValues] = useState(() => initialActionValues(m)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const action = code.split(":")[0]!,
    def = deliveryActionDefinitions[action]!,
    needsDriver =
      def.driver || (def.decision && values.decision === "REASSIGN"),
    needsAgency = def.agency || (def.decision && values.decision === "RETURN");
  const drivers = useDeliveryData<EligibleDriver[]>(
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
  );
  const eligible = (drivers.data ?? []).filter(
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
        `${(e as Error).message} La saisie est conservée. Après une coupure, actualisez la mission pour vérifier l’état de l’opération.`,
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={deliveryActionName(code)}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="delivery-action-form"
      >
        <p>{def.description}</p>
        <strong>{m?.order.publicNumber ?? h?.publicNumber}</strong>
        {!!h && (
          <p>
            Remis par {h.fromName} · {h.agencyName}
            <br />
            {h.reason}
          </p>
        )}
        {!!error && <ErrorState message={error} />}
        <fieldset disabled={busy}>
          {def.decision && (
            <>
              <Select
                label="Incident à traiter"
                value={values.incidentId}
                onChange={(e) =>
                  setValues((v) => ({ ...v, incidentId: e.target.value }))
                }
              >
                <option value="">Choisir un incident</option>
                {m?.incidents
                  .filter((i) => i.status === "OPEN")
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {incidentReasons[i.kind] ?? i.kind} ·{" "}
                      {new Date(i.createdAt).toLocaleString("fr-FR")}
                    </option>
                  ))}
              </Select>
              <Select
                label="Décision"
                value={values.decision}
                onChange={(e) =>
                  setValues((v) => ({ ...v, decision: e.target.value }))
                }
              >
                <option value="RETRY">Autoriser une nouvelle tentative</option>
                <option value="REASSIGN">
                  Réaffecter avec transfert de garde si nécessaire
                </option>
                <option value="RETURN">Demander le retour à l’agence</option>
                <option value="NOTE">
                  Clore cet incident avec une observation
                </option>
              </Select>
            </>
          )}
          {needsDriver && (
            <>
              <Select
                label={
                  action === "TRANSFER_CREATE"
                    ? "Agent de transport"
                    : "Livreur éligible"
                }
                value={values.courierId}
                onChange={(e) =>
                  setValues((v) => ({ ...v, courierId: e.target.value }))
                }
              >
                <option value="">Choisir un livreur disponible</option>
                {eligible.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName} · {d.activeMissions} mission(s) active(s)
                  </option>
                ))}
              </Select>
              {drivers.error && (
                <ErrorState message={drivers.error} retry={drivers.reload} />
              )}
              <small>
                La disponibilité déclarée et le nombre de missions sont
                distincts. Un livreur disponible peut recevoir plusieurs
                missions.
              </small>
              {drivers.data?.map((d) => (
                <p className="delivery-driver-state" key={d.id}>
                  {d.fullName} ·{" "}
                  {d.eligible ? "Disponible pour affectation" : "Non éligible"}{" "}
                  · {d.activeMissions} mission(s)
                </p>
              ))}
            </>
          )}
          {needsAgency && (
            <Select
              label={
                action === "TRANSFER_CREATE"
                  ? "Agence destinataire"
                  : "Agence de retour"
              }
              value={values.agencyId}
              onChange={(e) =>
                setValues((v) => ({ ...v, agencyId: e.target.value }))
              }
            >
              <option value="">Choisir l’agence autorisée</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
          {(def.failure || def.incident) && (
            <Select
              label="Motif structuré"
              value={values.kind}
              onChange={(e) =>
                setValues((v) => ({ ...v, kind: e.target.value }))
              }
            >
              {Object.entries(incidentReasons).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          )}
          {def.condition && (
            <Select
              label="État du colis à la réception"
              value={values.condition}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  condition: e.target.value,
                  restock: e.target.value === "GOOD" ? v.restock : false,
                }))
              }
            >
              <option value="GOOD">Intact et conforme</option>
              <option value="DAMAGED">Endommagé · à isoler</option>
              {action !== "RETURN_RECEIVE" && (
                <option value="REFUSED">Réception refusée</option>
              )}
            </Select>
          )}
          {def.incident && (
            <Choice
              label="Incident bloquant · décision du responsable nécessaire"
              checked={values.blocking}
              onChange={(e) =>
                setValues((v) => ({ ...v, blocking: e.target.checked }))
              }
            />
          )}
          {def.restock &&
            m?.order.type === "FROM_STOCK" &&
            context.permissions.includes("deliveries.returns") &&
            context.subscriptionAccess?.valid !== false && (
              <Choice
                label="Réintégrer en stock les articles reçus et contrôlés intacts"
                checked={values.restock}
                disabled={values.condition !== "GOOD"}
                onChange={(e) =>
                  setValues((v) => ({ ...v, restock: e.target.checked }))
                }
              />
            )}
          <Field
            label={
              action === "RETURN_SHOP"
                ? "Représentant de la boutique et motif de remise"
                : def.reason
                  ? "Motif et observations"
                  : "Observation facultative"
            }
            required={def.reason}
            minLength={def.reason ? 3 : undefined}
            maxLength={500}
            value={values.reason}
            onChange={(e) =>
              setValues((v) => ({ ...v, reason: e.target.value }))
            }
          />
        </fieldset>
        <div className="delivery-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Revenir à la mission
          </Button>
          <Button type="submit" busy={busy}>
            Confirmer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
