import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, timingSafeEqual, } from "node:crypto";
import { stockError } from "../stocks/access.js";
function key() {
    const secret = process.env.DELIVERY_SECRET;
    if (!secret || secret.length < 32)
        throw stockError("PROOF_CONFIGURATION_REQUIRED", "Le service de confirmation doit être configuré.", 503);
    return createHmac("sha256", secret)
        .update("DND delivery confirmation v1")
        .digest();
}
export const digest = (value, purpose = "tracking") => createHmac("sha256", key())
    .update(purpose + "\0" + value)
    .digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export const otpCode = () => String(randomInt(0, 1000000)).padStart(6, "0");
export function seal(value, context) {
    const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
    c.setAAD(Buffer.from(context));
    return Buffer.concat([
        iv,
        c.update(value, "utf8"),
        c.final(),
        c.getAuthTag(),
    ]).toString("base64url");
}
export function unseal(value, context) {
    const bytes = Buffer.from(value, "base64url"), c = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
    c.setAAD(Buffer.from(context));
    c.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([c.update(bytes.subarray(12, -16)), c.final()]).toString("utf8");
}
export function matches(a, b) {
    const x = Buffer.from(a), y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
}
export const finalPhases = [
    "FINAL_DISTRIBUTION",
    "AT_DESTINATION",
    "AWAITING_PROOF",
];
export const eligible = (p) => p.status === "IN_PROGRESS" &&
    finalPhases.includes(p.phase ?? "") &&
    !!p.pickedUpAt &&
    !p.closedAt &&
    p.custodyType === "COURIER" &&
    p.custodyUserId === p.courierId;
