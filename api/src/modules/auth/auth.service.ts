import { randomUUID } from "node:crypto";
import type { AuthSettings } from "../../config/auth.js";
import {
  authorizeGlobal,
  authorizeShop,
  authorizeTenant,
} from "../authorization/tenant-access.js";
import { AuthError, unauthorized } from "./errors.js";
import {
  hashPassword,
  verifyPassword,
  opaqueToken,
  tokenHash,
  csrfToken,
  sameHash,
  issueAccess,
  verifyAccess,
} from "./crypto.js";
import type {
  AuthStore,
  AuthPrincipal,
  AuthSession,
  AuthUser,
  ClientType,
  ResetMailer,
  Workspace,
} from "./types.js";
export interface LoginMeta {
  client: ClientType;
  deviceName: string;
  userAgent: string | null;
  ipHash: string | null;
}
const active = (u: AuthUser | null): u is AuthUser =>
  !!u && u.status === "ACTIVE" && !u.archivedAt;
const live = (s: AuthSession | null, now: Date): s is AuthSession =>
  !!s && !s.revokedAt && s.expiresAt > now;
export class AuthService {
  private dummy: Promise<string> | undefined;
  constructor(
    public readonly store: AuthStore,
    public readonly settings: AuthSettings,
    private readonly mailer: ResetMailer,
    private readonly clock = () => new Date(),
  ) {}
  private publicUser(user: AuthUser) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
    };
  }
  private async bundle(
    user: AuthUser,
    session: AuthSession,
    refreshToken: string,
  ) {
    return {
      accessToken: await issueAccess(
        this.settings,
        user.id,
        session.id,
        this.clock(),
      ),
      refreshToken,
      csrfToken:
        session.clientType === "WEB"
          ? csrfToken(this.settings.secret, session.familyId)
          : null,
      accessExpiresAt: new Date(
        this.clock().getTime() + this.settings.accessSeconds * 1000,
      ).toISOString(),
      refreshExpiresAt: session.expiresAt.toISOString(),
      user: this.publicUser(user),
    };
  }
  async login(email: string, password: string, meta: LoginMeta) {
    const user = await this.store.findUserByEmail(email);
    const encoded =
      user?.passwordHash ??
      (await (this.dummy ??= hashPassword(opaqueToken())));
    const verified = await verifyPassword(encoded, password);
    if (!active(user) || !verified) {
      await this.store.event(user?.id ?? null, "LOGIN_FAILURE", {
        reason: "invalid_credentials",
      });
      throw new AuthError(
        401,
        "INVALID_CREDENTIALS",
        "E-mail ou mot de passe incorrect.",
      );
    }
    const refresh = opaqueToken(),
      familyId = randomUUID(),
      now = this.clock();
    const session = await this.store.transaction(async (tx) => {
      const current = await tx.lockUser(user.id);
      if (!active(current) || current.passwordHash !== encoded)
        throw unauthorized();
      const value = await tx.createSession({
        id: randomUUID(),
        userId: user.id,
        refreshTokenHash: tokenHash(refresh),
        familyId,
        expiresAt: new Date(
          now.getTime() + this.settings.refreshDays * 86400000,
        ),
        revokedAt: null,
        replacedById: null,
        clientType: meta.client,
        deviceName: meta.deviceName,
        csrfHash:
          meta.client === "WEB"
            ? tokenHash(csrfToken(this.settings.secret, familyId))
            : null,
        activeContext: null,
        userAgent: meta.userAgent,
        ipHash: meta.ipHash,
      });
      await tx.event(user.id, "LOGIN_SUCCESS", { client: meta.client });
      return value;
    });
    return this.bundle(user, session, refresh);
  }
  async authenticate(
    token: string,
    client: ClientType,
  ): Promise<AuthPrincipal> {
    const claims = await verifyAccess(this.settings, token, this.clock());
    const session = await this.store.findSession(claims.sessionId),
      user = await this.store.findUserById(claims.userId);
    if (
      !live(session, this.clock()) ||
      session.userId !== claims.userId ||
      session.clientType !== client ||
      !active(user)
    )
      throw unauthorized();
    return { user, session };
  }
  async inspectRefresh(raw: string, client: ClientType, strict = true) {
    const session = await this.store.findRefresh(tokenHash(raw));
    if (!session || session.clientType !== client) throw unauthorized();
    if (
      strict &&
      (!live(session, this.clock()) ||
        !active(await this.store.findUserById(session.userId)))
    )
      throw unauthorized();
    return session;
  }
  checkCsrf(session: AuthSession, provided: string | undefined) {
    if (session.clientType !== "WEB") return;
    if (
      !provided ||
      !session.csrfHash ||
      !sameHash(session.csrfHash, tokenHash(provided))
    )
      throw new AuthError(
        403,
        "CSRF_REJECTED",
        "La v�rification de s�curit� a �chou�. Rechargez la page.",
      );
  }
  async refresh(raw: string, client: ClientType, csrf?: string) {
    const now = this.clock(),
      replacement = opaqueToken();
    const result = await this.store.transaction(async (tx) => {
      const old = await tx.lockRefresh(tokenHash(raw));
      if (!old || old.clientType !== client) return { error: true as const };
      this.checkCsrf(old, csrf);
      if (old.revokedAt || old.replacedById) {
        await tx.revokeFamily(old.familyId, now);
        await tx.event(old.userId, "TOKEN_REVOKED", {
          reason: "refresh_reuse",
        });
        return { error: true as const };
      }
      const user = await tx.lockUser(old.userId);
      if (!active(user) || old.expiresAt <= now) {
        await tx.revokeFamily(old.familyId, now);
        return { error: true as const };
      }
      const next = await tx.createSession({
        id: randomUUID(),
        userId: old.userId,
        familyId: old.familyId,
        expiresAt: old.expiresAt,
        clientType: old.clientType,
        deviceName: old.deviceName,
        csrfHash: old.csrfHash,
        activeContext: old.activeContext,
        userAgent: old.userAgent,
        ipHash: old.ipHash,
        refreshTokenHash: tokenHash(replacement),
        revokedAt: null,
        replacedById: null,
      });
      await tx.replaceSession(old.id, next.id, now);
      return { error: false as const, user, session: next };
    });
    if (result.error) throw unauthorized();
    return this.bundle(result.user, result.session, replacement);
  }
  async logout(raw: string, client: ClientType, csrf?: string) {
    const session = await this.inspectRefresh(raw, client, false);
    this.checkCsrf(session, csrf);
    await this.store.transaction(async (tx) => {
      await tx.revokeFamily(session.familyId, this.clock());
      await tx.event(session.userId, "LOGOUT", { scope: "device" });
    });
  }
  async logoutAll(principal: AuthPrincipal) {
    await this.store.transaction(async (tx) => {
      await this.requireCurrent(tx, principal);
      await tx.revokeUser(principal.user.id, this.clock());
      await tx.event(principal.user.id, "TOKEN_REVOKED", {
        reason: "logout_all",
      });
    });
  }
  private async requireCurrent(tx: AuthStore, p: AuthPrincipal) {
    const session = await tx.lockSession(p.session.id),
      user = await tx.lockUser(p.user.id);
    if (
      !live(session, this.clock()) ||
      session.userId !== p.user.id ||
      !active(user)
    )
      throw unauthorized();
    return user;
  }
  async profile(p: AuthPrincipal) {
    const choices = await this.store.workspaces(p.user.id);
    const key = this.contextKey(p.session);
    return {
      user: this.publicUser(p.user),
      organizations: choices,
      activeContext: choices.find((v) => v.key === key) ?? null,
      csrfToken:
        p.session.clientType === "WEB"
          ? csrfToken(this.settings.secret, p.session.familyId)
          : null,
    };
  }
  private contextKey(s: AuthSession) {
    return typeof s.activeContext === "object" &&
      s.activeContext !== null &&
      "key" in s.activeContext &&
      typeof s.activeContext.key === "string"
      ? s.activeContext.key
      : null;
  }
  async switchOrganization(p: AuthPrincipal, key: string) {
    await this.store.transaction(async (tx) => {
      await this.requireCurrent(tx, p);
      const choices = await tx.workspaces(p.user.id);
      if (!choices.some((v) => v.key === key))
        throw new AuthError(
          403,
          "CONTEXT_DENIED",
          "Cet environnement n'est pas accessible.",
        );
      await tx.setContext(p.session.id, key);
      await tx.event(p.user.id, "PERMISSIONS_CHANGED", {
        reason: "context_selected",
      });
    });
    const session = await this.store.findSession(p.session.id);
    if (!session) throw unauthorized();
    return this.profile({ ...p, session });
  }
  async requirePermission(
    p: AuthPrincipal,
    permission: string,
  ): Promise<Workspace> {
    const choices = await this.store.workspaces(p.user.id),
      value = choices.find((v) => v.key === this.contextKey(p.session));
    if (!value || !value.permissions.includes(permission))
      throw new AuthError(
        403,
        "CONTEXT_DENIED",
        "Votre environnement ou vos autorisations ont chang�. S�lectionnez un acc�s valide.",
      );
    if (value.scope === "GLOBAL")
      await authorizeGlobal(this.store.authorization(), p.user.id, permission);
    else if (value.scope === "SHOP" && value.shopId &&
      (permission.startsWith("shop.") || (!value.companyId && permission === "workspace.access")))
      await authorizeShop(this.store.authorization(), p.user.id, value.shopId, permission);
    else if (value.companyId)
      await authorizeTenant(
        this.store.authorization(),
        {
          userId: p.user.id,
          companyId: value.companyId,
          ...(value.agencyId ? { agencyId: value.agencyId } : {}),
          ...(value.shopId ? { shopId: value.shopId } : {}),
        },
        permission,
      );
    else throw unauthorized();
    return value;
  }
  async sessions(p: AuthPrincipal) {
    return (await this.store.listSessions(p.user.id, this.clock())).map(
      (s) => ({
        id: s.id,
        deviceName: s.deviceName,
        clientType: s.clientType,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        current: s.id === p.session.id,
      }),
    );
  }
  async revokeSession(p: AuthPrincipal, id: string) {
    await this.store.transaction(async (tx) => {
      await this.requireCurrent(tx, p);
      const value = await tx.findSession(id);
      if (!value || value.userId !== p.user.id)
        throw new AuthError(404, "SESSION_NOT_FOUND", "Session introuvable.");
      await tx.revokeFamily(value.familyId, this.clock());
      await tx.event(p.user.id, "TOKEN_REVOKED", { reason: "device_revoked" });
    });
  }
  async updateProfile(
    p: AuthPrincipal,
    data: { fullName: string; phone: string | null },
  ) {
    await this.store.transaction(async (tx) => {
      await this.requireCurrent(tx, p);
      await tx.updateProfile(p.user.id, data);
    });
    const user = await this.store.findUserById(p.user.id);
    if (!user) throw unauthorized();
    return this.profile({ ...p, user });
  }
  async changePassword(p: AuthPrincipal, current: string, next: string) {
    const encoded = await hashPassword(next);
    await this.store.transaction(async (tx) => {
      const user = await this.requireCurrent(tx, p);
      if (!(await verifyPassword(user.passwordHash, current)))
        throw new AuthError(
          400,
          "PASSWORD_INCORRECT",
          "Le mot de passe actuel est incorrect.",
        );
      await tx.setPassword(user.id, encoded);
      await tx.consumeResets(user.id, this.clock());
      await tx.revokeUser(user.id, this.clock());
      await tx.event(user.id, "PASSWORD_RESET", { reason: "password_changed" });
    });
  }
  async forgotPassword(email: string) {
    if (!this.mailer.available())
      throw new AuthError(
        503,
        "MAIL_UNAVAILABLE",
        "Le service de r�cup�ration par e-mail est indisponible. Contactez votre administrateur.",
      );
    const user = await this.store.findUserByEmail(email);
    if (!active(user)) return;
    const raw = opaqueToken(),
      now = this.clock();
    const issued = await this.store.transaction(async (tx) => {
      const current = await tx.lockUser(user.id);
      if (!active(current)) return false;
      await tx.consumeResets(user.id, now);
      await tx.createReset({
        id: randomUUID(),
        userId: user.id,
        tokenHash: tokenHash(raw),
        expiresAt: new Date(now.getTime() + this.settings.resetMinutes * 60000),
        usedAt: null,
      });
      return true;
    });
    if (!issued) return;
    void this.mailer
      .send(user.email, {
        web: `${this.settings.webUrl}/reinitialisation#token=${encodeURIComponent(raw)}`,
        // Custom URI schemes can be claimed by an unrelated installed app.
        // Keep recovery capabilities on the configured first-party Web origin
        // until verified Android App Links / iOS Universal Links are deployed.
        mobile: `${this.settings.webUrl}/reinitialisation#token=${encodeURIComponent(raw)}`,
      })
      .catch(() =>
        this.store.event(user.id, "PASSWORD_RESET", {
          reason: "mail_delivery_failed",
        }),
      )
      .catch(() => undefined);
  }
  async resetPassword(raw: string, next: string) {
    const encoded = await hashPassword(next);
    await this.store.transaction(async (tx) => {
      const token = await tx.lockReset(tokenHash(raw));
      if (!token || token.usedAt || token.expiresAt <= this.clock())
        throw new AuthError(
          400,
          "RESET_INVALID",
          "Ce lien est invalide ou a expir�.",
        );
      const user = await tx.lockUser(token.userId);
      if (!active(user))
        throw new AuthError(
          400,
          "RESET_INVALID",
          "Ce lien est invalide ou a expir�.",
        );
      await tx.setPassword(user.id, encoded);
      await tx.consumeResets(user.id, this.clock());
      await tx.revokeUser(user.id, this.clock());
      await tx.event(user.id, "PASSWORD_RESET", { reason: "token_consumed" });
    });
  }
}
