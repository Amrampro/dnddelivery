import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type { ListQuery } from "./validation.js";
export const companySelect = {
  id: true,
  reference: true,
  name: true,
  tradeName: true,
  email: true,
  phone: true,
  address: true,
  city: true,
  countryCode: true,
  registrationNumber: true,
  description: true,
  status: true,
  administrativeReason: true,
  statusChangedAt: true,
  statusChangedById: true,
  primaryAdminUserId: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  logoKey: true,
} as const satisfies Prisma.CompanySelect;
export const invitationSelect = {
  id: true,
  companyId: true,
  email: true,
  fullName: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  isPrimary: true,
  deliveryStatus: true,
  lastSentAt: true,
  version: true,
  createdAt: true,
} as const satisfies Prisma.CompanyInvitationSelect;
export const adminActions = [
  "PLATFORM_SHOP_ARCHIVED",
  "PLATFORM_SHOP_STATUS_CHANGED",
  "COMPANY_CREATED",
  "COMPANY_UPDATED",
  "COMPANY_ACTIVATED",
  "COMPANY_SUSPENDED",
  "COMPANY_DEACTIVATED",
  "COMPANY_REACTIVATED",
  "COMPANY_ADMIN_ASSIGNED",
  "COMPANY_ADMIN_REMOVED",
  "COMPANY_PRIMARY_CHANGED",
  "COMPANY_ADMIN_INVITED",
  "COMPANY_INVITATION_RESENT",
  "COMPANY_INVITATION_REVOKED",
  "COMPANY_INVITATION_ACCEPTED",
  "COMPANY_LOGO_UPDATED",
];
export function companyDto<T extends { id: string; logoKey: string | null }>(
  value: T,
) {
  const { logoKey, ...rest } = value;
  return {
    ...rest,
    logoUrl: logoKey ? `/admin/companies/${value.id}/logo` : null,
  };
}
export class AdminRepository {
  constructor(readonly db: PrismaClient) {}
  async invitations(page: number, pageSize: number, companyId?: string) {
    const where = { kind: "ADMIN", ...(companyId ? { companyId } : {}) };
    const [total, items] = await this.db.$transaction(
      [
        this.db.companyInvitation.count({ where }),
        this.db.companyInvitation.findMany({
          where,
          select: {
            ...invitationSelect,
            company: { select: { name: true, reference: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ],
      { isolationLevel: "RepeatableRead" },
    );
    return { items, total, page, pageSize };
  }
  async userByEmail(email: string) {
    const user = await this.db.user.findUnique({
      where: { email },
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        archivedAt: true,
      },
    });
    return user && user.status === "ACTIVE" && !user.archivedAt
      ? { id: user.id, fullName: user.fullName, email: user.email }
      : null;
  }
  async list(query: ListQuery) {
    const where: Prisma.CompanyWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.country ? { countryCode: query.country } : {}),
      ...(query.city ? { city: { contains: query.city } } : {}),
      ...(query.q
        ? {
            OR: ["name", "reference", "email", "tradeName"].map((field) => ({
              [field]: { contains: query.q },
            })),
          }
        : {}),
    };
    const [total, rows] = await this.db.$transaction(
      [
        this.db.company.count({ where }),
        this.db.company.findMany({
          where,
          select: companySelect,
          orderBy: [
            { createdAt: query.sort === "oldest" ? "asc" : "desc" },
            { id: "asc" },
          ],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ],
      { isolationLevel: "RepeatableRead" },
    );
    return {
      items: rows.map(companyDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
  admins(companyId: string) {
    return this.db.companyMembership.findMany({
      where: {
        companyId,
        active: true,
        role: { code: "company_admin", scope: "COMPANY" },
      },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            status: true,
            archivedAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }
  async history(page: number, pageSize: number, companyId?: string) {
    const where = {
      action: { in: adminActions },
      ...(companyId ? { companyId } : {}),
    };
    const [total, items] = await this.db.$transaction(
      [
        this.db.auditLog.count({ where }),
        this.db.auditLog.findMany({
          where,
          select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            companyId: true,
            createdAt: true,
            metadata: true,
            actor: { select: { fullName: true, id: true } },
            company: { select: { name: true, reference: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ],
      { isolationLevel: "RepeatableRead" },
    );
    return { items, total, page, pageSize };
  }
  async dashboard(days: number) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - days + 1);
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    end.setUTCDate(end.getUTCDate() + 1);
    const data = await this.db.$transaction(
      async (tx) => {
        const statuses = await tx.company.groupBy({
          by: ["status"],
          _count: { _all: true },
        });
        const trend = await tx.$queryRaw<
          Array<{ day: string; count: bigint }>
        >`SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS day, COUNT(*) AS count FROM Company WHERE createdAt >= ${start} AND createdAt < ${end} GROUP BY DATE_FORMAT(createdAt, '%Y-%m-%d') ORDER BY day`;
        const latest = await tx.company.findMany({
          select: companySelect,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: 5,
        });
        const activity = await tx.auditLog.findMany({
          where: {
            action: { in: adminActions },
            createdAt: { gte: start, lt: end },
          },
          select: {
            id: true,
            companyId: true,
            entityId: true,
            action: true,
            createdAt: true,
            company: { select: { name: true } },
            actor: { select: { fullName: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 6,
        });
        return { statuses, trend, latest, activity };
      },
      { isolationLevel: "RepeatableRead" },
    );
    const trend = Array.from({ length: days }, (_, i) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + i);
      const day = date.toISOString().slice(0, 10);
      return {
        day,
        count: Number(data.trend.find((v) => v.day === day)?.count ?? 0),
      };
    });
    return {
      from: start.toISOString(),
      until: end.toISOString(),
      days,
      counts: {
        total: data.statuses.reduce((n, v) => n + v._count._all, 0),
        active:
          data.statuses.find((v) => v.status === "ACTIVE")?._count._all ?? 0,
        suspended:
          data.statuses.find((v) => v.status === "SUSPENDED")?._count._all ?? 0,
        inactive:
          data.statuses.find((v) => v.status === "INACTIVE")?._count._all ?? 0,
        newCompanies: trend.reduce((n, v) => n + v.count, 0),
      },
      trend,
      latest: data.latest.map(companyDto),
      activity: data.activity,
    };
  }
}
