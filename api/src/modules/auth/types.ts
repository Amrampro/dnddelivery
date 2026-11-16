import type { AuthorizationStore } from "../authorization/tenant-access.js";
export type ClientType = "WEB" | "MOBILE";
export interface UnavailableOrganization {
  kind: "COMPANY" | "SHOP";
  name: string;
  status: "INACTIVE" | "SUSPENDED" | "ARCHIVED";
}
export interface AuthUser {
  customerEnabled?: boolean;
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  phone: string | null;
  status: string;
  archivedAt: Date | null;
}
export interface AuthSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  clientType: string;
  deviceName: string;
  csrfHash: string | null;
  activeContext: unknown;
  userAgent: string | null;
  ipHash: string | null;
  createdAt: Date;
  lastSeenAt: Date;
}
export interface ResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}
export interface Workspace {
  subscriptionAccess?: {
    valid: boolean;
    status: string;
    expiresAt: string | null;
  };
  key: string;
  scope: "GLOBAL" | "COMPANY" | "AGENCY" | "SHOP";
  companyId?: string;
  agencyId?: string;
  shopId?: string;
  companyName: string;
  agencyName?: string;
  shopName?: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
  portal:
    "super-admin" | "entreprise" | "agence" | "stock" | "boutique" | "livreur";
}
export interface AuthPrincipal {
  user: AuthUser;
  session: AuthSession;
}
export type NewSession = Omit<AuthSession, "createdAt" | "lastSeenAt">;
export interface AuthStore {
  transaction<T>(work: (tx: AuthStore) => Promise<T>): Promise<T>;
  findUserByEmail(email: string): Promise<AuthUser | null>;
  findUserById(id: string): Promise<AuthUser | null>;
  lockUser(id: string): Promise<AuthUser | null>;
  findSession(id: string): Promise<AuthSession | null>;
  lockSession(id: string): Promise<AuthSession | null>;
  findRefresh(hash: string): Promise<AuthSession | null>;
  lockRefresh(hash: string): Promise<AuthSession | null>;
  createSession(data: NewSession): Promise<AuthSession>;
  replaceSession(id: string, nextId: string, now: Date): Promise<void>;
  revokeFamily(familyId: string, now: Date): Promise<void>;
  revokeUser(userId: string, now: Date): Promise<void>;
  listSessions(userId: string, now: Date): Promise<AuthSession[]>;
  setContext(id: string, key: string): Promise<void>;
  updateProfile(
    id: string,
    profile: { fullName: string; phone: string | null },
  ): Promise<void>;
  setPassword(id: string, passwordHash: string): Promise<void>;
  createReset(data: ResetToken): Promise<void>;
  lockReset(hash: string): Promise<ResetToken | null>;
  consumeResets(userId: string, now: Date): Promise<void>;
  event(
    userId: string | null,
    type:
      | "LOGIN_SUCCESS"
      | "LOGIN_FAILURE"
      | "LOGOUT"
      | "TOKEN_REVOKED"
      | "PASSWORD_RESET"
      | "PERMISSIONS_CHANGED",
    metadata: Record<string, string>,
  ): Promise<void>;
  workspaces(userId: string): Promise<Workspace[]>;
  unavailableOrganizations(userId: string): Promise<UnavailableOrganization[]>;
  authorization(): AuthorizationStore;
}
export interface ResetMailer {
  available(): boolean;
  send(to: string, links: { web: string; mobile: string }): Promise<void>;
}
