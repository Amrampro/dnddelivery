// Test double only: never imported by application runtime.
import type {
  AuthStore,
  AuthUser,
  AuthSession,
  ResetToken,
  NewSession,
  Workspace,
} from "../../src/modules/auth/types.js";
import type { Grant } from "../../src/modules/authorization/tenant-access.js";
interface Data {
  users: Map<string, AuthUser>;
  sessions: Map<string, AuthSession>;
  resets: Map<string, ResetToken>;
  contexts: Map<string, Workspace[]>;
  companies: Map<string, boolean>;
  companyGrants: Map<string, Grant>;
  agencyGrants: Map<string, Grant>;
  shopGrants: Map<string, Grant>;
  globalGrants: Map<string, Grant>;
  agencies: Set<string>;
  shops: Set<string>;
  events: Array<{
    userId: string | null;
    type: string;
    metadata: Record<string, string>;
  }>;
}
interface Root {
  data: Data;
  queue: Promise<void>;
}
export class MemoryAuthStore implements AuthStore {
  private root: Root;
  constructor(
    root?: Root,
    private nested = false,
  ) {
    this.root = root ?? {
      queue: Promise.resolve(),
      data: {
        users: new Map(),
        sessions: new Map(),
        resets: new Map(),
        contexts: new Map(),
        companies: new Map(),
        companyGrants: new Map(),
        agencyGrants: new Map(),
        shopGrants: new Map(),
        globalGrants: new Map(),
        agencies: new Set(),
        shops: new Set(),
        events: [],
      },
    };
  }
  get data() {
    return this.root.data;
  }
  async transaction<T>(work: (tx: AuthStore) => Promise<T>): Promise<T> {
    if (this.nested) return work(this);
    const previous = this.root.queue;
    let release!: () => void;
    this.root.queue = new Promise<void>((r) => {
      release = r;
    });
    await previous;
    const snapshot = structuredClone(this.data);
    try {
      return await work(new MemoryAuthStore(this.root, true));
    } catch (e) {
      this.root.data = snapshot;
      throw e;
    } finally {
      release();
    }
  }
  async findUserByEmail(email: string) {
    return [...this.data.users.values()].find((v) => v.email === email) ?? null;
  }
  async findUserById(id: string) {
    return this.data.users.get(id) ?? null;
  }
  async lockUser(id: string) {
    return this.findUserById(id);
  }
  async findSession(id: string) {
    return this.data.sessions.get(id) ?? null;
  }
  async lockSession(id: string) {
    return this.findSession(id);
  }
  async findRefresh(hash: string) {
    return (
      [...this.data.sessions.values()].find(
        (v) => v.refreshTokenHash === hash,
      ) ?? null
    );
  }
  async lockRefresh(hash: string) {
    return this.findRefresh(hash);
  }
  async createSession(data: NewSession) {
    const value = { ...data, createdAt: new Date(), lastSeenAt: new Date() };
    this.data.sessions.set(data.id, value);
    return value;
  }
  async replaceSession(id: string, nextId: string, now: Date) {
    const s = this.data.sessions.get(id)!;
    this.data.sessions.set(id, { ...s, revokedAt: now, replacedById: nextId });
  }
  async revokeFamily(id: string, now: Date) {
    for (const [key, s] of this.data.sessions)
      if (s.familyId === id)
        this.data.sessions.set(key, { ...s, revokedAt: now });
  }
  async revokeUser(id: string, now: Date) {
    for (const [key, s] of this.data.sessions)
      if (s.userId === id)
        this.data.sessions.set(key, { ...s, revokedAt: now });
  }
  async listSessions(id: string, now: Date) {
    return [...this.data.sessions.values()].filter(
      (s) => s.userId === id && !s.revokedAt && s.expiresAt > now,
    );
  }
  async setContext(id: string, key: string) {
    const s = this.data.sessions.get(id)!;
    this.data.sessions.set(id, { ...s, activeContext: { key } });
  }
  async updateProfile(
    id: string,
    data: { fullName: string; phone: string | null },
  ) {
    const u = this.data.users.get(id)!;
    this.data.users.set(id, { ...u, ...data });
  }
  async setPassword(id: string, passwordHash: string) {
    const u = this.data.users.get(id)!;
    this.data.users.set(id, { ...u, passwordHash });
  }
  async createReset(data: ResetToken) {
    this.data.resets.set(data.id, data);
  }
  async lockReset(hash: string) {
    return (
      [...this.data.resets.values()].find((v) => v.tokenHash === hash) ?? null
    );
  }
  async consumeResets(userId: string, now: Date) {
    for (const [id, t] of this.data.resets)
      if (t.userId === userId) this.data.resets.set(id, { ...t, usedAt: now });
  }
  async event(
    userId: string | null,
    type: Parameters<AuthStore["event"]>[1],
    metadata: Record<string, string>,
  ) {
    this.data.events.push({ userId, type, metadata });
  }
  authorization() {
    return {
      userActive: async (id: string) => {
        const u = this.data.users.get(id);
        return u?.status === "ACTIVE" && !u.archivedAt;
      },
      companyActive: async (id: string) => this.data.companies.get(id) ?? false,
      subscriptionValid: async () => true,
      companyGrant: async (u: string, c: string) =>
        this.data.companyGrants.get(`${u}:${c}`) ?? null,
      agencyActive: async (a: string, c: string) =>
        this.data.agencies.has(`${c}:${a}`),
      agencyGrant: async (u: string, c: string, a: string) =>
        this.data.agencyGrants.get(`${u}:${c}:${a}`) ?? null,
      shopActive: async (s: string, c: string) =>
        this.data.shops.has(`${c}:${s}`),
      shopIdentityActive: async (s: string) =>
        [...this.data.shopGrants.entries()].some(([key, value]) => key.endsWith(`:${s}`) && value.active),
      shopGrant: async (u: string, s: string) =>
        this.data.shopGrants.get(`${u}:${s}`) ?? null,
      globalGrant: async (u: string) => this.data.globalGrants.get(u) ?? null,
    };
  }
  async unavailableOrganizations() { return []; }
  async workspaces(userId: string) {
    const auth = this.authorization(),
      out: Workspace[] = [];
    if (!(await auth.userActive(userId))) return out;
    for (const value of this.data.contexts.get(userId) ?? []) {
      let grants: Grant[] = [];
      if (value.scope === "GLOBAL") {
        const g = await auth.globalGrant(userId);
        if (g?.active) grants = [g];
      } else if (value.scope === "SHOP" && value.shopId && !value.companyId &&
        await auth.shopIdentityActive(value.shopId)) {
        const g=await auth.shopGrant(userId,value.shopId);
        if(g?.active)grants=[g];
      } else if (
        value.companyId &&
        (await auth.companyActive(value.companyId))
      ) {
        if (
          value.scope === "SHOP" &&
          value.shopId &&
          (await auth.shopActive(value.shopId, value.companyId))
        ) {
          const g = await auth.shopGrant(userId, value.shopId);
          if (g?.active) grants = [g];
        } else {
          const c = await auth.companyGrant(userId, value.companyId);
          if (c?.active) {
            if (value.scope === "COMPANY") grants = [c];
            else if (
              value.agencyId &&
              (await auth.agencyActive(value.agencyId, value.companyId))
            ) {
              const a = await auth.agencyGrant(
                userId,
                value.companyId,
                value.agencyId,
              );
              if (a?.active) grants = [c, a];
            }
          }
        }
      }
      const permissions = [...new Set(grants.flatMap((g) => g.permissions))];
      if (permissions.includes("workspace.access"))
        out.push({ ...value, permissions });
    }
    return out;
  }
}
