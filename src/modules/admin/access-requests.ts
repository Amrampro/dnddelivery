import { randomUUID } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { requireTrustedOrigin } from "../auth/auth.middleware.js";
import { AuthError } from "../auth/errors.js";
import { getAdminService } from "./runtime.js";
import type { AdminService } from "./service.js";
import { companyFields } from "./validation.js";

export const accessRequestInput = companyFields
  .omit({ reference: true, tradeName: true, registrationNumber: true })
  .extend({
    fullName: z.string().trim().min(2).max(160),
    organizationType: z.literal("DELIVERY_COMPANY"),
    confirmedDeliveryCompany: z.literal(true),
  })
  .strict();
export const accessRequestQuery = z
  .object({
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const accessRequestDecision = z
  .object({
    version: z.number().int().positive(),
    decision: z.enum(["APPROVED", "REJECTED"]),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export async function submitAccessRequest(
  service: AdminService,
  input: z.infer<typeof accessRequestInput>,
) {
  const {
    organizationType: _type,
    confirmedDeliveryCompany: _confirmed,
    ...fields
  } = input;
  void _type;
  void _confirmed;
  try {
    await service.db.companyAccessRequest.create({
      data: { ...fields, pendingEmail: fields.email },
    });
  } catch (error) {
    if (!(
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ))
      throw error;
  }
  // The same response for a new or already pending request does not expose applicants.
  return {
    message:
      "Votre demande a été prise en compte. Si une demande est déjà en attente pour cette adresse, elle est conservée. L’accès sera disponible après validation par l’administration.",
  };
}
export async function listAccessRequests(
  service: AdminService,
  input: z.infer<typeof accessRequestQuery>,
) {
  const where = input.status ? { status: input.status } : {};
  return service.db.$transaction(
    async (tx) => {
      const items = await tx.companyAccessRequest.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 15,
        skip: (input.page - 1) * 15,
      });
      const total = await tx.companyAccessRequest.count({ where });
      const groups = await tx.companyAccessRequest.groupBy({
        by: ["status"],
        _count: { _all: true },
      });
      return {
        items,
        total,
        page: input.page,
        pageSize: 15,
        counts: Object.fromEntries(
          ["PENDING", "APPROVED", "REJECTED"].map((s) => [
            s,
            groups.find((g) => g.status === s)?._count._all ?? 0,
          ]),
        ),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function decideAccessRequest(
  service: AdminService,
  actor: string,
  id: string,
  input: z.infer<typeof accessRequestDecision>,
) {
  const result = await service.write(actor, async (tx) => {
    await tx.$queryRaw`SELECT id FROM CompanyAccessRequest WHERE id = ${id} FOR UPDATE`;
    const request = await tx.companyAccessRequest.findUnique({ where: { id } });
    if (!request)
      throw new AuthError(404, "REQUEST_NOT_FOUND", "Demande introuvable.");
    if (request.status !== "PENDING" || request.version !== input.version)
      throw new AuthError(
        409,
        "REQUEST_ALREADY_REVIEWED",
        "Cette demande a déjà changé. Actualisez la liste.",
      );
    let created:
      Awaited<ReturnType<AdminService["createInTransaction"]>> | undefined;
    if (input.decision === "APPROVED") {
      const existing = await tx.user.findUnique({
        where: { email: request.email },
      });
      created = await service.createInTransaction(tx, actor, {
        name: request.name,
        reference: `ENT-${randomUUID().toUpperCase()}`,
        email: request.email,
        phone: request.phone,
        countryCode: request.countryCode,
        city: request.city,
        address: request.address,
        description: request.description,
        status: "ACTIVE",
        administrator: existing
          ? { mode: "existing", userId: existing.id }
          : {
              mode: "invite",
              email: request.email,
              fullName: request.fullName,
            },
      });
    }
    await tx.companyAccessRequest.update({
      where: { id },
      data: {
        status: input.decision,
        reason: input.reason,
        reviewedAt: new Date(),
        reviewedById: actor,
        pendingEmail: null,
        companyId: created?.company.id,
        version: { increment: 1 },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor,
        companyId: created?.company.id,
        entityType: "CompanyAccessRequest",
        entityId: id,
        action: `COMPANY_ACCESS_${input.decision}`,
        metadata: { reason: input.reason },
      },
    });
    return created;
  });
  return result
    ? service.finishCreation(result)
    : { company: null, invitationDelivery: null };
}
export function createCompanyAccessRequestRouter(
  service: () => AdminService = getAdminService,
  origins: readonly string[] = env.CORS_ORIGINS,
) {
  const router = Router();
  router.use(
    (_req, res, next) => {
      res.set("Cache-Control", "no-store");
      next();
    },
    requireTrustedOrigin(origins),
    rateLimit({
      windowMs: 3600000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  router.post("/", async (req, res) => {
    res
      .status(202)
      .json(
        await submitAccessRequest(
          service(),
          accessRequestInput.parse(req.body),
        ),
      );
  });
  return router;
}
