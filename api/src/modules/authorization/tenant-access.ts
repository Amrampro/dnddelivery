import { z } from "zod";
import { AuthError } from "../auth/errors.js";
export class AccessDenied extends Error {
  constructor() {
    super("Access denied");
    this.name = "AccessDenied";
  }
}
export interface Grant {
  active: boolean;
  scope: "COMPANY" | "AGENCY" | "SHOP" | "GLOBAL";
  permissions: readonly string[];
}
export interface AuthorizationStore {
  subscriptionValid(companyId: string): Promise<boolean>;
  userActive(userId: string): Promise<boolean>;
  companyActive(companyId: string): Promise<boolean>;
  companyGrant(userId: string, companyId: string): Promise<Grant | null>;
  agencyActive(agencyId: string, companyId: string): Promise<boolean>;
  agencyGrant(
    userId: string,
    companyId: string,
    agencyId: string,
  ): Promise<Grant | null>;
  shopActive(shopId: string, companyId: string): Promise<boolean>;
  shopIdentityActive(shopId: string): Promise<boolean>;
  shopGrant(userId: string, shopId: string): Promise<Grant | null>;
  globalGrant(userId: string): Promise<Grant | null>;
}
const selection = z
  .object({
    userId: z.uuid(),
    companyId: z.uuid(),
    agencyId: z.uuid().optional(),
    shopId: z.uuid().optional(),
  })
  .strict()
  .refine((s) => !(s.agencyId && s.shopId));
export type TenantSelection = z.input<typeof selection>;
declare const contextBrand: unique symbol;
export type TenantContext = Readonly<
  TenantSelection & { permission: string; [contextBrand]: true }
>;
const issuedContexts = new WeakSet<object>();
const has = (grant: Grant | null, scope: Grant["scope"], permission: string) =>
  !!grant?.active &&
  grant.scope === scope &&
  grant.permissions.includes(permission);
// userId must come from verified authentication middleware, never request body or tenant parameters.
export async function authorizeTenant(
  store: AuthorizationStore,
  input: TenantSelection,
  permission: string,
): Promise<TenantContext> {
  const value = selection.parse(input);
  if (
    !(await store.userActive(value.userId)) ||
    !(await store.companyActive(value.companyId))
  )
    throw new AccessDenied();
  if (value.shopId) {
    if (
      !(await store.shopActive(value.shopId, value.companyId)) ||
      !has(
        await store.shopGrant(value.userId, value.shopId),
        "SHOP",
        permission,
      )
    )
      throw new AccessDenied();
  } else {
    const grant = await store.companyGrant(value.userId, value.companyId);
    if (!grant?.active || grant.scope !== "COMPANY") throw new AccessDenied();
    if (value.agencyId) {
      if (!(await store.agencyActive(value.agencyId, value.companyId)))
        throw new AccessDenied();
      if (
        !has(grant, "COMPANY", permission) &&
        !has(
          await store.agencyGrant(
            value.userId,
            value.companyId,
            value.agencyId,
          ),
          "AGENCY",
          permission,
        )
      )
        throw new AccessDenied();
    } else if (!has(grant, "COMPANY", permission)) throw new AccessDenied();
  }
  const context = Object.freeze({ ...value, permission }) as TenantContext;
  if (
    !permission.endsWith(".read") &&
    !["workspace.access", "subscriptions.declare"].includes(permission) &&
    !(await store.subscriptionValid(value.companyId))
  )
    throw new AuthError(
      403,
      "SUBSCRIPTION_REQUIRED",
      "Abonnement expir� ou absent : les nouvelles op�rations sont bloqu�es. Consultez Mon abonnement ou changez d'entreprise.",
    );
  issuedContexts.add(context);
  return context;
}
export function assertTenantContext(
  context: TenantContext,
  permission: string,
) {
  if (!issuedContexts.has(context) || context.permission !== permission)
    throw new AccessDenied();
}
export function tenantFilter(context: TenantContext, permission: string) {
  assertTenantContext(context, permission);
  return {
    companyId: context.companyId,
    ...(context.agencyId ? { agencyId: context.agencyId } : {}),
    ...(context.shopId ? { shopId: context.shopId } : {}),
  };
}
export async function authorizeGlobal(
  store: AuthorizationStore,
  authenticatedUserId: string,
  permission: string,
) {
  if (
    !(await store.userActive(authenticatedUserId)) ||
    !has(await store.globalGrant(authenticatedUserId), "GLOBAL", permission)
  )
    throw new AccessDenied();
}

/** Shop administration is independent of any carrier subscription. */
export async function authorizeShop(
  store: AuthorizationStore,
  userId: string,
  shopId: string,
  permission: string,
) {
  z.uuid().parse(shopId);
  if (
    !(permission === "workspace.access" || permission.startsWith("shop.")) ||
    !(await store.userActive(userId)) ||
    !(await store.shopIdentityActive(shopId)) ||
    !has(await store.shopGrant(userId, shopId), "SHOP", permission)
  ) throw new AccessDenied();
}
