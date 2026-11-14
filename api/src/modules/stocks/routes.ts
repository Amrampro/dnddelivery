import { Router, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { getDatabase } from "../../database/client.js";
import { getAuthService } from "../auth/runtime.js";
import type { AuthService } from "../auth/auth.service.js";
import {
  principal,
  requireAuthentication,
  requireCsrf,
  requireTrustedOrigin,
  requirePermission,
} from "../auth/auth.middleware.js";
import { StockService } from "./service.js";
import { stockError, type StockContext } from "./access.js";
import * as v from "./validation.js";
let runtime: StockService | undefined;
export const getStockService = () =>
  (runtime ??= new StockService(getDatabase()));
const uuid = (id: unknown) => z.uuid().parse(id);
export function createStockRouter(
  auth: () => AuthService = getAuthService,
  service: () => StockService = getStockService,
  origins: readonly string[] = env.CORS_ORIGINS,
) {
  const r = Router();
  // This router is mounted at /api; unrelated modules must keep their own middleware.
  const resources = [
    "/stocks",
    "/stock-deposits",
    "/stock-withdrawals",
    "/stock-reservations",
    "/stock-transfers",
    "/inventories",
  ];
  r.use((q, _s, n) =>
    resources.some((p) => q.path === p || q.path.startsWith(p + "/"))
      ? n()
      : n("router"),
  );
  r.use(
    (_q, s, n) => {
      s.set("Cache-Control", "no-store");
      n();
    },
    requireAuthentication(auth),
    requireTrustedOrigin(origins),
  );
  const writes = rateLimit({
    windowMs: 3600000,
    limit: 300,
    keyGenerator: (_q, s) => principal(s).user.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  r.use((q, s, n) =>
    ["POST", "PATCH", "DELETE", "PUT"].includes(q.method)
      ? requireCsrf(auth)(q, s, (e) => (e ? n(e) : writes(q, s, n)))
      : n(),
  );
  const context = (s: Response): StockContext => {
    const w = s.locals.workspace;
    return {
      actorId: principal(s).user.id,
      scope: w.scope,
      companyId: w.companyId,
      agencyId: w.agencyId,
      shopId: w.shopId,
    };
  };
  const access = (permission = "stocks.read") => [
    requirePermission(auth, "workspace.access"),
    async (
      _q: Parameters<ReturnType<typeof requirePermission>>[0],
      s: Response,
      n: Parameters<ReturnType<typeof requirePermission>>[2],
    ) => {
      try {
        const w = s.locals.workspace;
        if (!["COMPANY", "AGENCY", "SHOP"].includes(w.scope))
          throw stockError(
            "CONTEXT_DENIED",
            "Choisissez un espace professionnel.",
            403,
          );
        s.locals.workspace = await auth().requirePermission(
          principal(s),
          w.scope === "SHOP" && permission === "stocks.read"
            ? "shop.stocks.read"
            : permission,
        );
        n();
      } catch (e) {
        n(e);
      }
    },
  ];
  r.get("/stocks/summary", ...access(), async (q, s) =>
    s.json(await service().summary(context(s), v.query.parse(q.query))),
  );
  r.get("/stocks/options", ...access(), async (_q, s) =>
    s.json(await service().options(context(s))),
  );
  r.get("/stocks/movements", ...access(), async (q, s) =>
    s.json(await service().movements(context(s), v.query.parse(q.query))),
  );
  r.get("/stocks/alerts", ...access(), async (q, s) =>
    s.json(await service().balances(context(s), v.query.parse(q.query), true)),
  );
  r.get("/stocks", ...access(), async (q, s) =>
    s.json(await service().balances(context(s), v.query.parse(q.query))),
  );
  r.get("/stocks/:id", ...access(), async (q, s) =>
    s.json(await service().stock(context(s), uuid(q.params.id))),
  );
  r.patch(
    "/stocks/:id/threshold",
    ...access("stocks.threshold"),
    async (q, s) =>
      s.json(
        await service().setThreshold(
          context(s),
          uuid(q.params.id),
          v.threshold.parse(q.body),
        ),
      ),
  );
  r.get("/stock-deposits", ...access(), async (q, s) =>
    s.json(await service().deposits(context(s), v.query.parse(q.query))),
  );
  r.post("/stock-deposits", ...access("stocks.deposit"), async (q, s) =>
    s
      .status(201)
      .json(await service().createDeposit(context(s), v.deposit.parse(q.body))),
  );
  r.get("/stock-deposits/:id", ...access(), async (q, s) =>
    s.json(await service().deposit(context(s), uuid(q.params.id))),
  );
  for (const action of ["confirm", "cancel"] as const)
    r.post(
      `/stock-deposits/:id/${action}`,
      ...access("stocks.deposit"),
      async (q, s) =>
        s.json(
          await service().depositAction(
            context(s),
            uuid(q.params.id),
            action,
            v.action.parse(q.body),
          ),
        ),
    );
  r.get("/stock-withdrawals", ...access(), async (q, s) =>
    s.json(await service().withdrawals(context(s), v.query.parse(q.query))),
  );
  r.post("/stock-withdrawals", ...access("stocks.withdraw"), async (q, s) =>
    s
      .status(201)
      .json(
        await service().createWithdrawal(
          context(s),
          v.withdrawal.parse(q.body),
        ),
      ),
  );
  r.get("/stock-withdrawals/:id", ...access(), async (q, s) =>
    s.json(await service().withdrawal(context(s), uuid(q.params.id))),
  );
  r.get("/stock-reservations", ...access(), async (q, s) =>
    s.json(await service().reservations(context(s), v.query.parse(q.query))),
  );
  r.post("/stock-reservations", ...access("stocks.reserve"), async (q, s) =>
    s
      .status(201)
      .json(
        await service().createReservation(
          context(s),
          v.reservation.parse(q.body),
        ),
      ),
  );
  r.get("/stock-reservations/:id", ...access(), async (q, s) =>
    s.json(await service().reservation(context(s), uuid(q.params.id))),
  );
  for (const action of ["release", "consume"] as const)
    r.post(
      `/stock-reservations/:id/${action}`,
      ...access("stocks.reserve"),
      async (q, s) =>
        s.json(
          await service().reservationAction(
            context(s),
            uuid(q.params.id),
            action,
            v.action.parse(q.body),
          ),
        ),
    );
  r.get("/stock-transfers", ...access(), async (q, s) =>
    s.json(await service().transfers(context(s), v.query.parse(q.query))),
  );
  r.post("/stock-transfers", ...access("stocks.transfer"), async (q, s) =>
    s
      .status(201)
      .json(
        await service().createTransfer(context(s), v.transfer.parse(q.body)),
      ),
  );
  r.get("/stock-transfers/:id", ...access(), async (q, s) =>
    s.json(await service().transfer(context(s), uuid(q.params.id))),
  );
  for (const action of ["dispatch", "cancel"] as const)
    r.post(
      `/stock-transfers/:id/${action}`,
      ...access("stocks.transfer"),
      async (q, s) =>
        s.json(
          await service().transferAction(
            context(s),
            uuid(q.params.id),
            action,
            v.action.parse(q.body),
          ),
        ),
    );
  r.post(
    "/stock-transfers/:id/receive",
    ...access("stocks.transfer"),
    async (q, s) =>
      s.json(
        await service().receiveTransfer(
          context(s),
          uuid(q.params.id),
          v.receipt.parse(q.body),
        ),
      ),
  );
  r.post(
    "/stock-transfers/:id/incidents",
    ...access("stocks.transfer"),
    async (q, s) =>
      s.json(
        await service().declareIncident(
          context(s),
          uuid(q.params.id),
          v.incident.parse(q.body),
        ),
      ),
  );
  r.post(
    "/stock-transfers/:id/incidents/:incidentId/resolve",
    ...access("stocks.approve"),
    async (q, s) =>
      s.json(
        await service().resolveIncident(
          context(s),
          uuid(q.params.id),
          uuid(q.params.incidentId),
          v.resolution.parse(q.body),
        ),
      ),
  );
  r.get("/inventories", ...access(), async (q, s) =>
    s.json(await service().inventories(context(s), v.query.parse(q.query))),
  );
  r.post("/inventories", ...access("stocks.inventory"), async (q, s) =>
    s
      .status(201)
      .json(
        await service().createInventory(context(s), v.inventory.parse(q.body)),
      ),
  );
  r.get("/inventories/:id", ...access(), async (q, s) =>
    s.json(await service().inventory(context(s), uuid(q.params.id))),
  );
  r.post(
    "/inventories/:id/count",
    ...access("stocks.inventory"),
    async (q, s) =>
      s.json(
        await service().countInventory(
          context(s),
          uuid(q.params.id),
          v.count.parse(q.body),
        ),
      ),
  );
  for (const action of ["submit", "approve", "reject"] as const)
    r.post(
      `/inventories/:id/${action}`,
      ...access(action === "submit" ? "stocks.inventory" : "stocks.approve"),
      async (q, s) =>
        s.json(
          await service().inventoryAction(
            context(s),
            uuid(q.params.id),
            action,
            v.action.parse(q.body),
          ),
        ),
    );
  return r;
}
