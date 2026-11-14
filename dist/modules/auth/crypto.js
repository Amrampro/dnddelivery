import { randomBytes, createHash, createHmac, timingSafeEqual, } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { SignJWT, jwtVerify } from "jose";
import { unauthorized } from "./errors.js";
export const opaqueToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (value) => createHash("sha256").update(value).digest("hex");
export const csrfToken = (secret, familyId) => createHmac("sha256", secret)
    .update(`dnd-csrf:${familyId}`)
    .digest("base64url");
export const sameHash = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const hashPassword = (password) => hash(password, {
    algorithm: 2 /* Algorithm.Argon2id */,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
    outputLen: 32,
});
export async function verifyPassword(encoded, password) {
    try {
        return await verify(encoded, password);
    }
    catch {
        return false;
    }
}
export async function issueAccess(s, userId, sessionId, now) {
    return new SignJWT({ sid: sessionId, kind: "access" })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer("dnd-delivery")
        .setAudience("dnd-delivery-api")
        .setSubject(userId)
        .setIssuedAt(Math.floor(now.getTime() / 1000))
        .setExpirationTime(Math.floor(now.getTime() / 1000) + s.accessSeconds)
        .sign(new TextEncoder().encode(s.secret));
}
export async function verifyAccess(s, token, now) {
    try {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(s.secret), {
            algorithms: ["HS256"],
            issuer: "dnd-delivery",
            audience: "dnd-delivery-api",
            currentDate: now,
        });
        if (payload.kind !== "access" ||
            typeof payload.sid !== "string" ||
            typeof payload.sub !== "string")
            throw unauthorized();
        return { userId: payload.sub, sessionId: payload.sid };
    }
    catch {
        throw unauthorized();
    }
}
