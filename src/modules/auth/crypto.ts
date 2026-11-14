import {
  randomBytes,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { hash, verify, Algorithm } from "@node-rs/argon2";
import { SignJWT, jwtVerify } from "jose";
import type { AuthSettings } from "../../config/auth.js";
import { unauthorized } from "./errors.js";
export const opaqueToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const csrfToken = (secret: string, familyId: string) =>
  createHmac("sha256", secret)
    .update(`dnd-csrf:${familyId}`)
    .digest("base64url");
export const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const hashPassword = (password: string) =>
  hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
    outputLen: 32,
  });
export async function verifyPassword(encoded: string, password: string) {
  try {
    return await verify(encoded, password);
  } catch {
    return false;
  }
}
export async function issueAccess(
  s: AuthSettings,
  userId: string,
  sessionId: string,
  now: Date,
) {
  return new SignJWT({ sid: sessionId, kind: "access" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("dnd-delivery")
    .setAudience("dnd-delivery-api")
    .setSubject(userId)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + s.accessSeconds)
    .sign(new TextEncoder().encode(s.secret));
}
export async function verifyAccess(s: AuthSettings, token: string, now: Date) {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(s.secret),
      {
        algorithms: ["HS256"],
        issuer: "dnd-delivery",
        audience: "dnd-delivery-api",
        currentDate: now,
      },
    );
    if (
      payload.kind !== "access" ||
      typeof payload.sid !== "string" ||
      typeof payload.sub !== "string"
    )
      throw unauthorized();
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    throw unauthorized();
  }
}
