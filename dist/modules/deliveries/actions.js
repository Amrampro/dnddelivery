import { authorizationStore } from "../../repositories/authorization.repository.js";
import { assertSafeClosure } from "../subscriptions/access.js";
import { selection } from "./access.js";
export async function availableActions(tx, c, p, auth) {
    if (auth.kind === "shop" || !p.phase)
        return [];
    const valid = await authorizationStore(tx).subscriptionValid(p.companyId);
    let closure = false;
    if (!valid) {
        try {
            await assertSafeClosure(tx, selection(c), p.id, "DELIVERY_CLOSE");
            closure = true;
        }
        catch {
            /* Read-only when the limited closure policy does not apply. */
        }
    }
    const can = (permission, safe = false) => auth.permissions.includes(permission) && (valid || (safe && closure));
    const current = c.scope === "COMPANY" || c.agencyId === p.agencyId, driver = auth.kind === "driver" &&
        p.courierId === c.actorId &&
        (c.scope === "COMPANY" || p.agencyId === c.agencyId);
    const agency = auth.kind === "operator" && current, held = p.custodyType === "COURIER", inAgency = p.custodyType === "AGENCY", pending = p.handovers.some((h) => h.status === "PENDING") ||
        p.legs.some((l) => l.status === "DRAFT" || l.status === "IN_TRANSIT"), phase = p.phase;
    const list = [];
    for (const h of p.handovers)
        if (h.status === "PENDING" && agency && can("deliveries.assign", true))
            list.push("HANDOVER_CANCEL:" + h.id);
    if (agency &&
        !pending &&
        can("deliveries.assign") &&
        !p.parcelReturn &&
        [
            "WAITING_COLLECTION",
            "AT_AGENCY",
            "PREPARED",
            "WITH_COURIER",
            "IN_TRANSIT",
            "FINAL_DISTRIBUTION",
            "AT_DESTINATION",
            "FAILED",
        ].includes(phase))
        list.push(p.courierId ? "REASSIGN" : "ASSIGN");
    if (agency &&
        !pending &&
        inAgency &&
        phase === "AT_AGENCY" &&
        can("deliveries.prepare"))
        list.push("PREPARE");
    if (driver &&
        !pending &&
        can("deliveries.pickup") &&
        (p.order.type === "FROM_STOCK" && !p.stockIssuedAt
            ? phase === "PREPARED"
            : ["WAITING_COLLECTION", "AT_AGENCY", "PREPARED"].includes(phase)) &&
        (inAgency || p.custodyType === "SHOP"))
        list.push("PICKUP");
    if (driver &&
        !pending &&
        p.custodyUserId === c.actorId &&
        can("deliveries.progress", true)) {
        if (phase === "WITH_COURIER")
            list.push("DEPARTED");
        if (["WITH_COURIER", "IN_TRANSIT"].includes(phase))
            list.push("ARRIVED_AGENCY", "FINAL_DISTRIBUTION");
        if (phase === "FINAL_DISTRIBUTION")
            list.push("ARRIVED");
        if (phase === "RETURN_REQUESTED" && p.parcelReturn)
            list.push("RETURN_STARTED");
        if (phase === "RETURNING" && p.parcelReturn)
            list.push("RETURN_ARRIVED");
    }
    if (driver && !pending && held && can("deliveries.attempt", true)) {
        if (phase === "AT_DESTINATION")
            list.push("ATTEMPT_CONFIRM");
        if ([
            "WITH_COURIER",
            "IN_TRANSIT",
            "FINAL_DISTRIBUTION",
            "AT_DESTINATION",
            "AWAITING_PROOF",
        ].includes(phase))
            list.push("ATTEMPT_FAIL");
    }
    if ((agency || driver) &&
        can("deliveries.incident.report", true) &&
        [
            "WAITING_COLLECTION",
            "AT_AGENCY",
            "PREPARED",
            "WITH_COURIER",
            "IN_TRANSIT",
            "INTER_AGENCY_TRANSIT",
            "FINAL_DISTRIBUTION",
            "AT_DESTINATION",
            "AWAITING_PROOF",
            "FAILED",
            "RETURN_REQUESTED",
            "RETURNING",
            "RETURN_ARRIVED",
        ].includes(phase))
        list.push("INCIDENT");
    if (agency &&
        can("deliveries.incidents") &&
        p.incidents.some((i) => i.status === "OPEN"))
        list.push("RESOLVE_INCIDENT");
    if (agency &&
        !pending &&
        can("deliveries.incidents") &&
        phase === "FAILED" &&
        !p.parcelReturn &&
        !p.incidents.some((i) => i.status === "OPEN" && i.blocking))
        list.push("RETRY");
    if (agency &&
        !pending &&
        can("deliveries.receive", true) &&
        phase === "ARRIVED_AGENCY")
        list.push("AGENCY_RECEIVE");
    if (agency &&
        !pending &&
        inAgency &&
        can("deliveries.transfer") &&
        ["AT_AGENCY", "PREPARED", "RETURN_REQUESTED"].includes(phase))
        list.push("TRANSFER_CREATE");
    for (const l of p.legs) {
        if (l.status === "IN_TRANSIT" &&
            phase === "FAILED" &&
            auth.kind === "operator" &&
            (c.scope === "COMPANY" || c.agencyId === l.originAgencyId) &&
            can("deliveries.receive", true))
            list.push("TRANSFER_RETURN_ORIGIN:" + l.id);
        if (l.status === "DRAFT" && agency && can("deliveries.transfer", true)) {
            if (valid &&
                (p.order.type !== "FROM_STOCK" ||
                    p.stockIssuedAt ||
                    phase === "PREPARED"))
                list.push("TRANSFER_DISPATCH:" + l.id);
            list.push("TRANSFER_CANCEL:" + l.id);
        }
        if (l.status === "IN_TRANSIT" &&
            auth.kind === "operator" &&
            (c.scope === "COMPANY" || c.agencyId === l.destinationAgencyId) &&
            can("deliveries.receive", true))
            list.push("TRANSFER_RECEIVE:" + l.id);
    }
    if (agency &&
        !pending &&
        can("deliveries.returns", true) &&
        p.pickedUpAt &&
        !p.parcelReturn &&
        (held || inAgency) &&
        [
            "WITH_COURIER",
            "IN_TRANSIT",
            "FINAL_DISTRIBUTION",
            "AT_DESTINATION",
            "AWAITING_PROOF",
            "FAILED",
            "AT_AGENCY",
        ].includes(phase))
        list.push("RETURN_REQUEST");
    const ret = p.parcelReturn;
    if (ret &&
        auth.kind === "operator" &&
        (c.scope === "COMPANY" || c.agencyId === ret.agencyId) &&
        can("deliveries.returns.receive", true) &&
        ["REQUESTED", "IN_TRANSIT"].includes(ret.status) &&
        !pending &&
        (["RETURNING", "RETURN_ARRIVED"].includes(phase) ||
            (phase === "RETURN_REQUESTED" &&
                inAgency &&
                p.custodyAgencyId === ret.agencyId)))
        list.push("RETURN_RECEIVE");
    if (ret &&
        agency &&
        ret.status === "RECEIVED" &&
        !ret.reintegratedAt &&
        !ret.returnedToShopAt &&
        can("deliveries.returns")) {
        if (ret.condition === "GOOD" && p.order.type === "FROM_STOCK")
            list.push("RESTOCK");
        list.push("RETURN_SHOP");
    }
    if (agency &&
        !pending &&
        can("deliveries.cancel") &&
        !p.pickedUpAt &&
        ["WAITING_COLLECTION", "AT_AGENCY", "PREPARED"].includes(phase))
        list.push("CANCEL");
    return list;
}
