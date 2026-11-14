import { principal } from "../auth/auth.middleware.js";
import * as v from "./validation.js";
import { getLogo, putLogo } from "./logos.js";
export function adminController(service) {
    const companyId = (req) => v.idSchema.parse(req.params.id), actor = (res) => principal(res).user.id;
    return {
        invitations: async (req, res) => {
            const q = v.auditQuery.parse(req.query);
            res.json(await service().repository.invitations(q.page, q.pageSize, q.companyId));
        },
        dashboard: async (req, res) => {
            res.json(await service().repository.dashboard(v.periodQuery.parse(req.query).days));
        },
        list: async (req, res) => {
            res.json(await service().repository.list(v.listQuery.parse(req.query)));
        },
        create: async (req, res) => {
            res
                .status(201)
                .json(await service().create(actor(res), v.createCompany.parse(req.body)));
        },
        detail: async (req, res) => {
            res.json(await service().detail(companyId(req)));
        },
        update: async (req, res) => {
            res.json(await service().update(actor(res), companyId(req), v.updateCompany.parse(req.body)));
        },
        status: async (req, res) => {
            const input = v.statusChange.parse(req.body);
            res.json(await service().status(actor(res), companyId(req), input.version, input.status, input.reason));
        },
        admins: async (req, res) => {
            const detail = await service().detail(companyId(req));
            res.json({
                admins: detail.admins,
                primaryAdminUserId: detail.company.primaryAdminUserId,
                version: detail.company.version,
            });
        },
        associate: async (req, res) => {
            const input = v.associateAdmin.parse(req.body);
            res.json(await service().addAdmin(actor(res), companyId(req), input.userId, input.version, input.primary));
        },
        invite: async (req, res) => {
            const input = v.inviteAdmin.parse(req.body);
            res
                .status(201)
                .json(await service().invite(actor(res), companyId(req), input.version, input.email, input.fullName, input.primary));
        },
        primary: async (req, res) => {
            const input = v.primaryAdmin.parse(req.body);
            res.json(await service().changePrimary(actor(res), companyId(req), v.idSchema.parse(req.params.userId), input.version));
        },
        remove: async (req, res) => {
            const input = v.versionSchema.parse(req.body);
            res.json(await service().removeAdmin(actor(res), companyId(req), v.idSchema.parse(req.params.userId), input.version));
        },
        resend: async (req, res) => {
            res.json(await service().invitationAction(actor(res), v.idSchema.parse(req.params.id), v.versionSchema.parse(req.body).version, "resend"));
        },
        revoke: async (req, res) => {
            res.json(await service().invitationAction(actor(res), v.idSchema.parse(req.params.id), v.versionSchema.parse(req.body).version, "revoke"));
        },
        history: async (req, res) => {
            const query = v.auditQuery.parse(req.query);
            res.json(await service().repository.history(query.page, query.pageSize, query.companyId));
        },
        users: async (req, res) => {
            res.json({
                user: await service().repository.userByEmail(v.email.parse(req.query.email)),
            });
        },
        putLogo: async (req, res) => {
            const version = v.versionSchema.parse({
                version: Number(req.get("X-Company-Version")),
            }).version;
            res.json(await putLogo(service(), actor(res), companyId(req), version, req.body, req.get("Content-Type")?.split(";")[0] ?? ""));
        },
        getLogo: async (req, res) => {
            res.json(await getLogo(service(), companyId(req)));
        },
    };
}
