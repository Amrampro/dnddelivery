import type { DeliveryMission, PendingHandover } from "./deliveries";
export interface DeliveryActionValues {
  reason: string;
  courierId: string;
  agencyId: string;
  kind: string;
  condition: string;
  blocking: boolean;
  restock: boolean;
  incidentId: string;
  decision: string;
}
export interface DeliveryActionDefinition {
  title: string;
  description: string;
  reason?: boolean;
  driver?: boolean;
  agency?: boolean;
  condition?: boolean;
  incident?: boolean;
  failure?: boolean;
  decision?: boolean;
  restock?: boolean;
}
export const deliveryActionDefinitions: Record<
  string,
  DeliveryActionDefinition
> = {
  HANDOVER_CANCEL: {
    title: "Annuler la proposition de remise",
    description:
      "La garde et l’affectation restent au livreur actuel. Vous pourrez reprendre le suivi ou organiser un retour.",
    reason: true,
  },
  TRANSFER_RETURN_ORIGIN: {
    title: "Réceptionner le retour du transport à l’origine",
    description:
      "Après un incident en transit, confirmez uniquement lorsque le colis est réellement revenu dans l’agence de départ.",
    condition: true,
    reason: true,
  },
  ASSIGN: {
    title: "Affecter un livreur",
    description:
      "Le livreur recevra une mission. La garde physique du colis ne change pas.",
    driver: true,
  },
  REASSIGN: {
    title: "Réaffecter la mission",
    description:
      "Si le colis est déjà détenu par un livreur, le nouveau livreur devra confirmer la remise physique avant le changement de garde.",
    reason: true,
    driver: true,
  },
  PREPARE: {
    title: "Confirmer la préparation",
    description:
      "Vérifiez le colis et les articles réservés avant de les remettre au livreur.",
  },
  PICKUP: {
    title: "Confirmer la prise en charge",
    description:
      "Confirmez uniquement après réception physique du colis. Pour une première sortie depuis stock, les réservations seront consommées.",
  },
  DEPARTED: {
    title: "Commencer l’acheminement",
    description: "Le colis reste sous votre responsabilité pendant le trajet.",
  },
  ARRIVED_AGENCY: {
    title: "Déclarer l’arrivée en agence",
    description:
      "La garde restera au livreur jusqu’à la réception confirmée par l’agence.",
  },
  AGENCY_RECEIVE: {
    title: "Réceptionner le colis en agence",
    description:
      "Contrôlez le colis remis par le livreur. Cela ne crée pas d’entrée de marchandises dans le catalogue.",
    condition: true,
  },
  FINAL_DISTRIBUTION: {
    title: "Commencer la distribution finale",
    description: "Vous partez vers le destinataire indiqué sur la mission.",
  },
  ARRIVED: {
    title: "Déclarer l’arrivée chez le destinataire",
    description:
      "Cette action enregistre votre arrivée et ne marque pas la commande comme livrée.",
  },
  ATTEMPT_CONFIRM: {
    title: "Initier la confirmation de remise",
    description:
      "La remise reste ouverte. Poursuivez dans Confirmation et preuves pour vérifier le code du destinataire, joindre les photos et clôturer la livraison.",
  },
  ATTEMPT_FAIL: {
    title: "Déclarer une tentative échouée",
    description:
      "Indiquez le motif et vos observations. Le colis reste sous votre garde, sans retour automatique en stock.",
    reason: true,
    failure: true,
  },
  INCIDENT: {
    title: "Signaler un incident",
    description:
      "Décrivez la situation. Un incident bloquant nécessite une décision du responsable avant la reprise.",
    reason: true,
    incident: true,
  },
  RESOLVE_INCIDENT: {
    title: "Décider de la suite de l’incident",
    description: "L’historique et les tentatives précédentes seront conservés.",
    reason: true,
    decision: true,
  },
  RETRY: {
    title: "Autoriser une nouvelle tentative",
    description: "Les échecs précédents restent dans l’historique.",
    reason: true,
  },
  TRANSFER_CREATE: {
    title: "Préparer un trajet inter-agences",
    description:
      "Choisissez l’agence destinataire et le livreur chargé du transport. Aucun départ n’est encore enregistré.",
    driver: true,
    agency: true,
  },
  TRANSFER_DISPATCH: {
    title: "Confirmer le départ inter-agences",
    description:
      "Confirmez après remise physique à l’agent de transport. La responsabilité passe au transporteur de cette étape.",
  },
  TRANSFER_RECEIVE: {
    title: "Réceptionner le trajet inter-agences",
    description:
      "Confirmez la présence physique et l’état du colis dans l’agence destinataire. Aucun stock de catalogue n’est ajouté.",
    condition: true,
  },
  TRANSFER_CANCEL: {
    title: "Abandonner le trajet préparé",
    description:
      "Seul un trajet qui n’est pas encore parti peut être abandonné.",
    reason: true,
  },
  RETURN_REQUEST: {
    title: "Demander le retour physique",
    description:
      "Choisissez l’agence de retour. Les marchandises ne seront pas réintégrées avant leur réception et contrôle.",
    reason: true,
    agency: true,
  },
  RETURN_STARTED: {
    title: "Engager le trajet retour",
    description:
      "Vous conservez la garde du colis jusqu’à sa réception effective par l’agence.",
  },
  RETURN_ARRIVED: {
    title: "Déclarer l’arrivée du retour",
    description:
      "L’agence devra confirmer sa réception physique et contrôler le colis.",
  },
  RETURN_RECEIVE: {
    title: "Réceptionner et contrôler le retour",
    description:
      "Vérifiez sa présence et son état. Un colis endommagé restera isolé du stock disponible.",
    condition: true,
    restock: true,
  },
  RESTOCK: {
    title: "Réintégrer le retour intact",
    description:
      "Cette opération remet en stock les quantités réellement reçues et contrôlées. Elle ne peut pas être répétée.",
    reason: true,
  },
  RETURN_SHOP: {
    title: "Confirmer la restitution à la boutique",
    description:
      "Confirmez la remise physique à la boutique et précisez le représentant qui a reçu le colis.",
    reason: true,
  },
  CANCEL: {
    title: "Annuler avant prise en charge",
    description:
      "La commande et l’historique sont conservés. Les réservations encore actives seront libérées.",
    reason: true,
  },
  HANDOVER_ACCEPT: {
    title: "Confirmer la remise de garde",
    description:
      "Vérifiez le colis avant d’accepter sa garde. Refuser le laisse sous la responsabilité du livreur précédent.",
    condition: true,
  },
};
export const deliveryActionName = (code: string) =>
  deliveryActionDefinitions[code.split(":")[0] ?? code]?.title ?? code;
export const initialActionValues = (
  mission?: DeliveryMission,
): DeliveryActionValues => ({
  reason: "",
  courierId: "",
  agencyId: mission?.order.agencyId ?? "",
  kind: "ABSENT",
  condition: "GOOD",
  blocking: false,
  restock: false,
  incidentId: mission?.incidents.find((i) => i.status === "OPEN")?.id ?? "",
  decision: "RETRY",
});
export function deliveryActionRequest(
  m: DeliveryMission | undefined,
  code: string,
  value: DeliveryActionValues,
  operationKey: string,
  h?: PendingHandover,
) {
  const [action, entityId] = code.split(":"),
    definition = deliveryActionDefinitions[action ?? ""];
  if (!definition || (!m && !h))
    throw Error("Action indisponible. Actualisez la mission.");
  const id = m?.id ?? h!.deliveryId,
    body: Record<string, unknown> = {
      version: m?.version ?? h!.deliveryVersion,
      operationKey,
    };
  if (value.reason.trim()) body.reason = value.reason.trim();
  if (definition.reason && value.reason.trim().length < 3)
    throw Error("Indiquez un motif de trois caractères au minimum.");
  let path = `/deliveries/${id}`;
  if (action === "HANDOVER_ACCEPT") {
    path = `/driver/handovers/${h!.id}/confirm`;
    Object.assign(body, {
      deliveryId: id,
      handoverVersion: h!.version,
      condition: value.condition,
    });
  } else if (action === "HANDOVER_CANCEL") {
    path += `/handovers/${entityId}/cancel`;
  } else if (action === "ASSIGN" || action === "REASSIGN") {
    if (!value.courierId) throw Error("Choisissez un livreur éligible.");
    path += action === "ASSIGN" ? "/assign" : "/reassign";
    body.courierId = value.courierId;
  } else if (action === "PREPARE") path += "/prepare";
  else if (action === "PICKUP") path = `/driver/missions/${id}/pickup`;
  else if (
    [
      "DEPARTED",
      "ARRIVED_AGENCY",
      "FINAL_DISTRIBUTION",
      "ARRIVED",
      "RETURN_STARTED",
      "RETURN_ARRIVED",
    ].includes(action!)
  ) {
    path = `/driver/missions/${id}/events`;
    body.event = action;
  } else if (action === "ATTEMPT_CONFIRM" || action === "ATTEMPT_FAIL") {
    path = `/driver/missions/${id}/attempt`;
    body.result =
      action === "ATTEMPT_FAIL" ? "FAILED" : "AWAITING_CONFIRMATION";
    if (action === "ATTEMPT_FAIL") body.kind = value.kind;
  } else if (action === "INCIDENT") {
    path += "/incident";
    Object.assign(body, {
      kind: value.kind,
      description: value.reason.trim(),
      blocking: value.blocking,
    });
  } else if (action === "RESOLVE_INCIDENT") {
    const incident = m!.incidents.find(
      (i) => i.id === value.incidentId && i.status === "OPEN",
    );
    if (!incident) throw Error("Choisissez un incident encore ouvert.");
    path += `/incidents/${incident.id}/resolve`;
    Object.assign(body, {
      incidentVersion: incident.version,
      decision: value.decision,
    });
    if (value.decision === "REASSIGN") {
      if (!value.courierId) throw Error("Choisissez un autre livreur.");
      body.courierId = value.courierId;
    }
    if (value.decision === "RETURN") {
      if (!value.agencyId) throw Error("Choisissez une agence de retour.");
      body.agencyId = value.agencyId;
    }
  } else if (action === "RETRY") path += "/retry";
  else if (action === "AGENCY_RECEIVE") {
    path += "/receive";
    body.condition = value.condition;
  } else if (action === "TRANSFER_CREATE") {
    if (!value.agencyId || !value.courierId)
      throw Error("Choisissez l’agence destinataire et l’agent de transport.");
    path += "/transfers";
    Object.assign(body, {
      destinationAgencyId: value.agencyId,
      transporterId: value.courierId,
    });
  } else if (action?.startsWith("TRANSFER_")) {
    const leg = m!.legs.find((l) => l.id === entityId);
    if (!leg) throw Error("Trajet introuvable. Actualisez la mission.");
    path += `/transfers/${leg.id}/${action === "TRANSFER_DISPATCH" ? "dispatch" : action === "TRANSFER_RECEIVE" || action === "TRANSFER_RETURN_ORIGIN" ? "receive" : "cancel"}`;
    body.legVersion = leg.version;
    if (action === "TRANSFER_RECEIVE" || action === "TRANSFER_RETURN_ORIGIN")
      body.condition = value.condition;
    if (action === "TRANSFER_RETURN_ORIGIN") body.returnToOrigin = true;
  } else if (action === "RETURN_REQUEST") {
    if (!value.agencyId) throw Error("Choisissez l’agence de retour.");
    path += "/return";
    body.agencyId = value.agencyId;
  } else if (action === "RETURN_RECEIVE") {
    path += "/return/receive";
    Object.assign(body, {
      condition: value.condition,
      restock: value.condition === "GOOD" && value.restock,
    });
  } else if (action === "RESTOCK") path += "/return/reintegrate";
  else if (action === "RETURN_SHOP") path += "/return/shop";
  else if (action === "CANCEL") path += "/cancel";
  else throw Error("Action non reconnue.");
  if (
    value.condition === "REFUSED" &&
    definition.condition &&
    action !== "HANDOVER_ACCEPT" &&
    value.reason.trim().length < 3
  )
    throw Error("Précisez le motif du refus de réception.");
  return { path, body };
}
