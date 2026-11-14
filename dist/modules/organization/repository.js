import { AuthError } from "../auth/errors.js";
export const publicUser = {
    id: true,
    fullName: true,
    email: true,
    phone: true,
};
export const invitationSelect = {
    id: true,
    companyId: true,
    email: true,
    fullName: true,
    staffRole: true,
    agencyIds: true,
    expiresAt: true,
    acceptedAt: true,
    revokedAt: true,
    deliveryStatus: true,
    lastSentAt: true,
    version: true,
    createdAt: true,
};
export const profileSelect = {
    id: true,
    reference: true,
    name: true,
    tradeName: true,
    address: true,
    phone: true,
    email: true,
    city: true,
    countryCode: true,
    description: true,
    status: true,
    logoKey: true,
    version: true,
};
export class OrganizationRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    scope(c, q) {
        if (q?.agencyId && c.agencyId && q.agencyId !== c.agencyId)
            throw new AuthError(403, "AGENCY_SCOPE", "Agence non autorisée.");
        return c.agencyId ?? q?.agencyId;
    }
    async profile(c) {
        const p = await this.db.company.findUniqueOrThrow({
            where: { id: c.companyId },
            select: profileSelect,
        });
        const { logoKey, ...fields } = p;
        return { ...fields, logoUrl: logoKey ? "/company/profile/logo" : null };
    }
    async agencies(c, q) {
        const agencyId = this.scope(c, q);
        const where = {
            companyId: c.companyId,
            ...(agencyId ? { id: agencyId } : {}),
            ...(q.status ? { status: q.status } : {}),
            ...(q.q
                ? {
                    OR: [
                        { name: { contains: q.q } },
                        { reference: { contains: q.q } },
                        { city: { contains: q.q } },
                    ],
                }
                : {}),
        };
        const [total, items] = await this.db.$transaction([
            this.db.agency.count({ where }),
            this.db.agency.findMany({
                where,
                orderBy: [{ name: "asc" }, { id: "asc" }],
                skip: (q.page - 1) * q.size,
                take: q.size,
            }),
        ]);
        return { items, total, page: q.page, size: q.size };
    }
    async agency(c, id, withTeam = false) {
        const agencyId = this.scope(c);
        if (agencyId && agencyId !== id)
            throw new AuthError(404, "AGENCY_NOT_FOUND", "Agence introuvable.");
        const agency = await this.db.agency.findFirst({
            where: { id, companyId: c.companyId },
            include: {
                agencyMembership_agencyRecords: withTeam
                    ? {
                        where: { active: true, membership: { active: true } },
                        select: {
                            userId: true,
                            role: { select: { code: true, name: true } },
                            membership: { select: { user: { select: publicUser } } },
                        },
                    }
                    : false,
            },
        });
        if (!agency)
            throw new AuthError(404, "AGENCY_NOT_FOUND", "Agence introuvable.");
        return agency;
    }
    memberWhere(c, q) {
        const agencyId = this.scope(c, q);
        return {
            companyId: c.companyId,
            ...(agencyId
                ? {
                    agencyMembership_membershipRecords: {
                        some: { agencyId, active: true },
                    },
                }
                : {}),
            ...(q?.role
                ? q.role === "company_admin"
                    ? { role: { code: "company_admin" } }
                    : {
                        organizationRole: q.role,
                        role: { code: { not: "company_admin" } },
                    }
                : {}),
            ...(q?.status
                ? q.status === "ACTIVE"
                    ? { active: true, employmentStatus: "ACTIVE" }
                    : q.status === "SUSPENDED"
                        ? { active: false, employmentStatus: "SUSPENDED" }
                        : {
                            active: false,
                            employmentStatus: { in: ["INACTIVE", "ACTIVE"] },
                        }
                : {}),
            ...(q?.q
                ? {
                    user: {
                        OR: [
                            { fullName: { contains: q.q } },
                            { email: { contains: q.q } },
                        ],
                    },
                }
                : {}),
        };
    }
    async employees(c, q, drivers = false) {
        const where = this.memberWhere(c, drivers ? { ...q, status: undefined } : q);
        if (drivers)
            where.driverProfile = {
                is: { ...(q.status ? { status: q.status } : {}) },
            };
        const [total, items] = await this.db.$transaction([
            this.db.companyMembership.count({ where }),
            this.db.companyMembership.findMany({
                where,
                select: {
                    id: true,
                    userId: true,
                    active: true,
                    organizationRole: true,
                    employmentStatus: true,
                    version: true,
                    role: { select: { code: true, name: true } },
                    user: { select: publicUser },
                    driverProfile: true,
                    agencyMembership_membershipRecords: {
                        where: c.agencyId ? { agencyId: c.agencyId } : {},
                        select: {
                            agencyId: true,
                            active: true,
                            role: { select: { code: true, name: true } },
                            agency: { select: { name: true, status: true } },
                        },
                    },
                },
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                skip: (q.page - 1) * q.size,
                take: q.size,
            }),
        ]);
        return { total, items, page: q.page, size: q.size };
    }
    async employee(c, userId) {
        return this.db.companyMembership.findFirst({
            where: { ...this.memberWhere(c), userId },
            include: {
                user: { select: publicUser },
                role: { select: { code: true, name: true } },
                driverProfile: true,
                agencyMembership_membershipRecords: {
                    where: c.agencyId ? { agencyId: c.agencyId } : {},
                    select: {
                        agencyId: true,
                        active: true,
                        agency: { select: { name: true, status: true } },
                        role: { select: { code: true, name: true } },
                    },
                },
            },
        });
    }
    async invitations(c, q) {
        const where = { companyId: c.companyId, kind: "STAFF" };
        const [total, items] = await this.db.$transaction([
            this.db.companyInvitation.count({ where }),
            this.db.companyInvitation.findMany({
                where,
                select: invitationSelect,
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                skip: (q.page - 1) * q.size,
                take: q.size,
            }),
        ]);
        return { total, items, page: q.page, size: q.size };
    }
    async history(c, q) {
        const where = {
            companyId: c.companyId,
            action: { startsWith: "ORG_" },
            ...(c.agencyId ? { agencyId: c.agencyId } : {}),
        };
        const [total, items] = await this.db.$transaction([
            this.db.auditLog.count({ where }),
            this.db.auditLog.findMany({
                where,
                include: { actor: { select: { fullName: true } } },
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                skip: (q.page - 1) * q.size,
                take: q.size,
            }),
        ]);
        return { total, items, page: q.page, size: q.size };
    }
    async self(c) {
        return this.db.companyMembership.findUnique({
            where: {
                companyId_userId: { companyId: c.companyId, userId: c.actorId },
            },
            select: {
                id: true,
                userId: true,
                version: true,
                role: { select: { code: true, name: true } },
                organizationRole: true,
                employmentStatus: true,
                active: true,
                user: { select: publicUser },
                driverProfile: true,
                agencyMembership_membershipRecords: {
                    select: {
                        active: true,
                        agency: { select: { id: true, name: true, status: true } },
                        role: { select: { code: true, name: true } },
                    },
                },
            },
        });
    }
}
