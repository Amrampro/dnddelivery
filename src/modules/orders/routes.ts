import { Router, type Response } from "express";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { getDatabase } from "../../database/client.js";
import { env } from "../../config/env.js";
import { getAuthService } from "../auth/runtime.js";
import {
  principal,
  requireAuthentication,
  requireCsrf,
  requireTrustedOrigin,
  requirePermission,
} from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import { OrderService } from "./service.js";
import type { OrderContext } from "./access.js";
import * as v from "./validation.js";
let runtime: OrderService | undefined;
export const getOrderService = () =>
  (runtime ??= new OrderService(getDatabase()));
export function createOrderRouter(
  auth: () => AuthService = getAuthService,
  service: () => OrderService = getOrderService,
  origins: readonly string[] = env.CORS_ORIGINS,
) {
  const r = Router();
  r.use((q, _s, n) =>
    ["/orders", "/recipients"].some(
      (p) => q.path === p || q.path.startsWith(p + "/"),
    )
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
    requirePermission(auth, "workspace.access"),
  );
  const limit = rateLimit({
    windowMs: 3600000,
    limit: 300,
    keyGenerator: (_q, s) => principal(s).user.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  r.use((q, s, n) =>
    ["POST", "PATCH"].includes(q.method)
      ? requireCsrf(auth)(q, s, (e) => (e ? n(e) : limit(q, s, n)))
      : n(),
  );
  const c = (s: Response): OrderContext => ({
    actorId: principal(s).user.id,
    ...s.locals.workspace,
  });
  const id = (x: unknown) => z.uuid().parse(x);
  r.get("/orders/options", async (_q, s) =>
    s.json(await service().options(c(s))),
  );
  r.post(
    "/orders/customer-lookup",
    rateLimit({
      windowMs: 3600000,
      limit: 30,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      keyGenerator: (_q, s) => principal(s).user.id,
    }),
    async (q, s) => {
      s.json(
        await service().customerLookup(
          c(s),
          z
            .object({ email: z.email().max(254) })
            .strict()
            .parse(q.body).email,
        ),
      );
    },
  );
  r.get("/orders/catalogue", async (q, s) =>
    s.json(
      await service().catalogue(
        c(s),
        z
          .object({
            companyId: z.uuid(),
            shopId: z.uuid(),
            agencyId: z.uuid(),
            q: z.string().trim().max(160).optional(),
            page: z.coerce.number().int().positive().max(100000).default(1),
            size: z.coerce.number().int().min(1).max(50).default(20),
          })
          .strict()
          .parse(q.query),
      ),
    ),
  );
  r.get("/orders/drafts", async (q, s) =>
    s.json(
      await service().list(c(s), v.query.parse({ ...q.query, draft: "true" })),
    ),
  );
  r.get("/orders", async (q, s) =>
    s.json(await service().list(c(s), v.query.parse(q.query))),
  );
  r.post("/orders", async (q, s) =>
    s.status(201).json(await service().create(c(s), v.creation.parse(q.body))),
  );
  r.get("/orders/:id", async (q, s) =>
    s.json(await service().detail(c(s), id(q.params.id))),
  );
  r.patch("/orders/:id", async (q, s) =>
    s.json(await service().edit(c(s), id(q.params.id), v.edit.parse(q.body))),
  );
  r.get("/orders/:id/history", async (q, s) =>
    s.json(await service().history(c(s), id(q.params.id))),
  );
  r.get("/orders/:id/items", async (q, s) =>
    s.json(
      (await service().detail(c(s), id(q.params.id))).orderItem_orderRecords,
    ),
  );
  for (const action of ["submit", "cancel"] as const)
    r.post(`/orders/:id/${action}`, async (q, s) =>
      s.json(
        await service()[action](c(s), id(q.params.id), v.action.parse(q.body)),
      ),
    );
  r.get("/recipients", async (q, s) =>
    s.json(await service().recipients(c(s), v.query.parse(q.query))),
  );
  r.get("/recipients/:id", async (q, s) =>
    s.json(
      (
        await service().recipients(
          c(s),
          v.query.parse(q.query),
          id(q.params.id),
        )
      ).items[0],
    ),
  );
  const recipientBody = z
    .object({
      companyId: z.uuid(),
      shopId: z.uuid(),
      agencyId: z.uuid(),
      recipient: v.recipient,
    })
    .strict();
  r.post("/recipients", async (q, s) =>
    s
      .status(201)
      .json(await service().recipientWrite(c(s), recipientBody.parse(q.body))),
  );
  r.patch("/recipients/:id", async (q, s) => {
    const x = recipientBody
      .extend({ version: z.number().int().positive() })
      .parse(q.body);
    s.json(await service().recipientWrite(c(s), x, id(q.params.id), x.version));
  });
  return r;
}
