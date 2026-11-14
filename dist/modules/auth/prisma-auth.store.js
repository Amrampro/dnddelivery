import { Prisma } from "../../generated/prisma/client.js";
import { serializable } from "../../database/transaction.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
import { loadWorkspaces } from "./workspaces.js";
export function prismaAuthStore(db) {
    const store = {
        transaction: async (work) => {
            if (!("$transaction" in db))
                return work(store);
            return serializable(db, (tx) => work(prismaAuthStore(tx)));
        },
        findUserByEmail: (email) => db.user.findUnique({ where: { email } }),
        findUserById: (id) => db.user.findUnique({ where: { id } }),
        lockUser: async (id) => {
            await db.$queryRaw `SELECT id FROM \`User\` WHERE id = ${id} FOR UPDATE`;
            return db.user.findUnique({ where: { id } });
        },
        findSession: (id) => db.session.findUnique({ where: { id } }),
        lockSession: async (id) => {
            await db.$queryRaw `SELECT id FROM \`Session\` WHERE id = ${id} FOR UPDATE`;
            return db.session.findUnique({ where: { id } });
        },
        findRefresh: (refreshTokenHash) => db.session.findUnique({ where: { refreshTokenHash } }),
        lockRefresh: async (hash) => {
            await db.$queryRaw `SELECT id FROM \`Session\` WHERE refreshTokenHash = ${hash} FOR UPDATE`;
            return db.session.findUnique({ where: { refreshTokenHash: hash } });
        },
        createSession: async (data) => db.session.create({
            data: {
                ...data,
                activeContext: data.activeContext == null
                    ? Prisma.DbNull
                    : data.activeContext,
            },
        }),
        replaceSession: async (id, nextId, now) => {
            await db.session.update({
                where: { id },
                data: { revokedAt: now, replacedById: nextId },
            });
        },
        revokeFamily: async (familyId, now) => {
            await db.session.updateMany({
                where: { familyId, revokedAt: null },
                data: { revokedAt: now },
            });
        },
        revokeUser: async (userId, now) => {
            await db.session.updateMany({
                where: { userId, revokedAt: null },
                data: { revokedAt: now },
            });
        },
        listSessions: (userId, now) => db.session.findMany({
            where: { userId, revokedAt: null, expiresAt: { gt: now } },
            orderBy: { createdAt: "desc" },
        }),
        setContext: async (id, key) => {
            await db.session.update({
                where: { id },
                data: { activeContext: { key }, lastSeenAt: new Date() },
            });
        },
        updateProfile: async (id, data) => {
            await db.user.update({ where: { id }, data });
        },
        setPassword: async (id, passwordHash) => {
            await db.user.update({ where: { id }, data: { passwordHash } });
        },
        createReset: async (data) => {
            await db.accountToken.create({
                data: { ...data, purpose: "PASSWORD_RESET" },
            });
        },
        lockReset: async (hash) => {
            await db.$queryRaw `SELECT id FROM \`AccountToken\` WHERE tokenHash = ${hash} AND purpose = 'PASSWORD_RESET' FOR UPDATE`;
            return db.accountToken.findFirst({
                where: { tokenHash: hash, purpose: "PASSWORD_RESET" },
            });
        },
        consumeResets: async (userId, now) => {
            await db.accountToken.updateMany({
                where: { userId, purpose: "PASSWORD_RESET", usedAt: null },
                data: { usedAt: now },
            });
        },
        event: async (userId, type, metadata) => {
            await db.authEvent.create({ data: { userId, type, metadata } });
        },
        workspaces: (userId) => loadWorkspaces(db, userId),
        authorization: () => authorizationStore(db),
    };
    return store;
}
