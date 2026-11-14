import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { createDatabase, disconnectDatabase } from "../../src/database/client.js";
import { AdminService } from "../../src/modules/admin/service.js";
import { createCompany } from "../../src/modules/admin/validation.js";
import { hashPassword } from "../../src/modules/auth/crypto.js";
import { invitationMailer } from "../../src/modules/auth/smtp.js";
import { SubscriptionService } from "../../src/modules/subscriptions/service.js";
import { declarationInput } from "../../src/modules/subscriptions/rules.js";
import { OrganizationService } from "../../src/modules/organization/service.js";
import { agencyFields, inviteInput } from "../../src/modules/organization/validation.js";
import { PartnerService } from "../../src/modules/partners/service.js";
import { registration } from "../../src/modules/partners/validation.js";
import { ProductService } from "../../src/modules/products/service.js";
import { create as productInput } from "../../src/modules/products/validation.js";
import { StockService } from "../../src/modules/stocks/service.js";
import { OrderService } from "../../src/modules/orders/service.js";
import { creation } from "../../src/modules/orders/validation.js";
import { DeliveryService } from "../../src/modules/deliveries/service.js";
import { FinancialService } from "../../src/modules/collections/service.js";
import { ConfirmationService } from "../../src/modules/confirmation/service.js";
import { LocalProofStorage } from "../../src/modules/confirmation/storage.js";
import { TrackingService, trackingLink } from "../../src/modules/confirmation/tracking.js";
import { ReportService } from "../../src/modules/reports/service.js";
import { query } from "../../src/modules/reports/period.js";
import { encodeExport } from "../../src/modules/reports/exports.js";
import { localSmtp } from "../helpers/local-smtp.js";

test("Parcours intégré MySQL et SMTP local, de l'inscription à la remise et au suivi", async t => {
  const uri = process.env.TEST_DATABASE_URL;
  assert.ok(uri && process.env.NODE_ENV === "test" && /^dnd_delivery\w*_test$/.test(new URL(uri).pathname.slice(1)));
  const db = createDatabase(uri);
  const suffix = randomUUID().slice(0, 8);
  const email = (role: string) => `${role}-${suffix}@example.invalid`;
  const password = randomBytes(24).toString("hex");
  const urls = new Map<string, string>();
  const smtp = await localSmtp(message => {
    const to = /^To:\s*(\S+)/mi.exec(message)?.[1];
    const body = message.replace(/=\r?\n/g, "").replace(/=3D/g, "=");
    const link = /http:\/\/localhost:5173\/invitation(?:-boutique)?#token=([A-Za-z0-9_-]+)/.exec(body);
    if (to && link?.[1]) urls.set(to, link[1]);
  });
  const mail = invitationMailer({ NODE_ENV: "test", SMTP_HOST: "127.0.0.1", SMTP_PORT: smtp.port, SMTP_FROM: "fixture@example.invalid" });
  const token = (address: string) => {
    const value = urls.get(address);
    assert.ok(value, "Invitation reçue sur le SMTP isolé");
    return value;
  };
  const timings: Record<string, number> = {};
  const timed = async <T>(label: string, work: () => Promise<T>) => {
    const start = performance.now();
    try { return await work(); } finally { timings[label] = Math.round(performance.now() - start); }
  };
  const proofDir = await mkdtemp(resolve(tmpdir(), "dnd-delivery-recipe-"));
  process.env.DATABASE_URL = uri;
  process.env.AUTH_ACCESS_SECRET = randomBytes(32).toString("hex");
  const { app } = await import("../../src/app.js");
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const root = `http://127.0.0.1:${address.port}/api`;
    const ready = await fetch(root + "/ready");
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: "ready" });
    const global = await db.user.create({ data: { email: email("global"), fullName: "Recette plateforme", passwordHash: await hashPassword(password) } });
    const role = await db.role.findUniqueOrThrow({ where: { code: "super_admin" } });
    await db.globalRoleGrant.create({ data: { userId: global.id, roleId: role.id, roleScope: "GLOBAL" } });
    const admin = new AdminService(db, mail, "http://localhost:5173");
    const fields = { name: "Entreprise recette", phone: "+237699123456", address: "Adresse de recette", countryCode: "CM", city: "Douala" };
    const makeCompany = (name: string) => admin.create(global.id, createCompany.parse({
      ...fields, reference: `REC-${name}-${suffix}`, email: email(name), status: "ACTIVE",
      administrator: { mode: "invite", email: email(name), fullName: "Administration recette" },
    }));
    await makeCompany("carrier");
    await makeCompany("other");
    for (const name of ["carrier", "other"]) await admin.accept(token(email(name)), "Administration recette", password);
    const company = await db.company.findFirstOrThrow({ where: { email: email("carrier") } });
    const other = await db.company.findFirstOrThrow({ where: { email: email("other") } });
    const user = (name: string) => db.user.findUniqueOrThrow({ where: { email: email(name) } });
    const cc = { actorId: (await user("carrier")).id, companyId: company.id, scope: "COMPANY" as const };
    const foreign = { actorId: (await user("other")).id, companyId: other.id, scope: "COMPANY" as const };
    const subscriptions = new SubscriptionService(db, randomBytes(32).toString("hex"));
    const { current: price } = await subscriptions.plan();
    assert.ok(price);
    const payment = await subscriptions.declare(cc.actorId, company.id, declarationInput.parse({
      amount: price.amount.toFixed(4), currency: price.currency, method: "CASH",
      externalReference: `REC-${suffix}`, paidAt: new Date(Date.now() - 1000).toISOString(), idempotencyKey: randomUUID(),
    }));
    await subscriptions.approve(global.id, payment.id, (await subscriptions.preview(payment.id)).previewToken);
    const organization = new OrganizationService(db, admin);
    const makeAgency = (reference: string) => organization.createAgency(cc, agencyFields.parse({ ...fields, reference }));
    const agency = await makeAgency("REC-A");
    const second = await makeAgency("REC-B");
    for (const [name, staffRole] of [["manager", "agency_manager"], ["driver", "courier"]]) {
      await organization.invite(cc, inviteInput.parse({ email: email(name!), fullName: "Équipe recette", role: staffRole, agencyIds: [agency.id] }));
      await organization.accept(token(email(name!)), { fullName: "Équipe recette", password });
    }
    const dc = { ...cc, actorId: (await user("driver")).id, scope: "AGENCY" as const, agencyId: agency.id };
    const ac = { ...dc, actorId: (await user("manager")).id };
    const driver = await db.driverProfile.findFirstOrThrow({ where: { companyId: company.id, userId: dc.actorId } });
    await organization.availability(dc, { version: driver.version, availability: "AVAILABLE" });
    const partners = new PartnerService(db, mail, "http://localhost:5173");
    await partners.register(registration.parse({ ...fields, name: "Boutique recette", email: email("shop"), district: "Centre", fullName: "Boutique recette", termsAccepted: true }));
    await partners.accept({ token: token(email("shop")), fullName: "Boutique recette", password, termsAccepted: true });
    const shop = await db.shop.findFirstOrThrow({ where: { email: email("shop") } });
    const sc = { actorId: (await user("shop")).id, scope: "SHOP" as const, shopId: shop.id };
    const pending = await partners.request(sc, { companyReference: company.reference });
    const active = await partners.action(cc, pending.id, "accept", { version: pending.version });
    await partners.setAgencies(cc, pending.id, { version: active.version, agencyIds: [agency.id, second.id] });
    const product = await new ProductService(db).create(sc, productInput.parse({ name: "Article recette" }));
    const stocks = new StockService(db);
    const deposit = await stocks.createDeposit(cc, { reference: `REC-${suffix}`, shopId: shop.id, agencyId: agency.id, items: [{ productId: product.id, quantity: 8 }] });
    await stocks.depositAction(cc, deposit.id, "confirm", { version: deposit.version });
    const stock = () => db.stock.findFirstOrThrow({ where: { companyId: company.id, agencyId: agency.id, shopId: shop.id, productId: product.id } });
    const orders = new OrderService(db), deliveries = new DeliveryService(db), finance = new FinancialService(db);
    const tracking = new TrackingService(db);
    const storage = new LocalProofStorage(proofDir);
    const confirmation = new ConfirmationService(db, storage);
    const action = (v: { version: number }) => ({ version: v.version, operationKey: randomUUID(), reason: "Recette de bout en bout" });
    const newOrder = (withStock: boolean) => orders.create(sc, creation.parse({
      companyId: company.id, agencyId: agency.id, shopId: shop.id, clientKey: randomUUID(), type: withStock ? "FROM_STOCK" : "ONE_OFF",
      recipient: { name: "Destinataire recette", email: email("recipient"), phone: fields.phone, country: "Cameroun", city: fields.city, address: fields.address },
      items: [{ productId: withStock ? product.id : undefined, name: "Article recette", quantity: 2 }],
      pickup: withStock ? undefined : { address: fields.address, contact: "Boutique recette", phone: fields.phone },
      parcelDescription: "Colis de recette", collectionRequired: withStock, amountToCollect: withStock ? "50.1234" : "0", currency: "XAF",
    }));
    const order = await timed("creation_reservation", () => newOrder(true));
    assert.equal((await stock()).reservedQuantity, 2);
    let mission = await deliveries.create(cc, { orderId: order.id, orderVersion: order.version, operationKey: randomUUID() });
    mission = await timed("affectation", () => deliveries.assign(cc, mission.id, { ...action(mission), courierId: dc.actorId }));
    mission = await deliveries.prepare(ac, mission.id, action(mission));
    mission = await timed("enlevement", () => deliveries.pickup(dc, mission.id, action(mission)));
    const issued = await stock();
    assert.equal(issued.physicalQuantity, 6);
    assert.equal(issued.reservedQuantity, 0);
    mission = await deliveries.progress(dc, mission.id, { ...action(mission), event: "DEPARTED" });
    mission = await timed("statut", () => deliveries.progress(dc, mission.id, { ...action(mission), event: "FINAL_DISTRIBUTION" }));
    await timed("encaissement", () => finance.declare(dc, { deliveryId: mission.id, deliveryVersion: mission.version, operationKey: randomUUID(), amount: "50.1234", method: "CASH" }));
    const stored = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    const link = await db.$transaction(tx => trackingLink(tx, stored));
    const raw = new URLSearchParams(new URL(link).hash.slice(1)).get("token");
    assert.ok(raw);
    const grant = await tracking.verify(stored.publicNumber, raw, suffix);
    const { code } = await tracking.code(stored.publicNumber, grant.session);
    let info = await confirmation.confirmation(dc, mission.id);
    await timed("otp", () => confirmation.verifyCode(dc, mission.id, { ...action(info), code }));
    const photo = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#033173" } }).jpeg().toBuffer();
    info = await timed("photo", () => confirmation.upload(dc, mission.id, { operationKey: randomUUID(), kind: "HANDOVER" }, photo, "image/jpeg"));
    const completed = await confirmation.complete(dc, mission.id, { ...action(info), evidenceIds: info.evidence.map(item => item.id) });
    assert.equal(completed.status, "DELIVERED");
    const file = await db.fileAsset.findFirstOrThrow({
      where: { companyId: company.id },
    });
    assert.equal(createHash("sha256").update(await storage.read(file.storageKey)).digest("hex"), file.checksumSha256);
    assert.ok((await tracking.detail(stored.publicNumber, grant.session)).confirmedAt);
    const collection = await db.collection.findFirstOrThrow({ where: { deliveryId: mission.id } });
    const remit = await finance.createRemittance(dc, { agencyId: agency.id, currency: "XAF", operationKey: randomUUID(), items: [{ collectionId: collection.id, amount: "50.1234" }] });
    await assert.rejects(finance.decideRemittance(dc, remit.id, { ...action(remit), decision: "CONFIRM", items: [] }));
    const decision = { ...action(remit), decision: "CONFIRM" as const, items: remit.items.map(item => ({ id: item.id, confirmedAmount: "50.1234" })) };
    await finance.decideRemittance(ac, remit.id, decision);
    await finance.decideRemittance(ac, remit.id, decision);
    assert.equal((await db.remittance.findUniqueOrThrow({ where: { id: remit.id } })).confirmedAmount?.toFixed(4), "50.1234");
    const reports = new ReportService(db);
    const report = await timed("rapport", () => reports.run(cc, "collections", query.parse({ preset: "today" })));
    assert.match(JSON.stringify(report), /50\.1234/);
    assert.ok((await encodeExport(report, "csv")).bytes.length > 0);
    await assert.rejects(reports.run(foreign, "collections", query.parse({ companyId: company.id })));
    await assert.rejects(deliveries.detail(foreign, mission.id));
    assert.ok(await db.auditLog.count({ where: { companyId: company.id } }) > 0);
    const oneOff = await newOrder(false);
    let oneOffMission = await deliveries.create(cc, {
      orderId: oneOff.id, orderVersion: oneOff.version, operationKey: randomUUID(),
    });
    oneOffMission = await deliveries.assign(cc, oneOffMission.id, { ...action(oneOffMission), courierId: dc.actorId });
    oneOffMission = await deliveries.pickup(dc, oneOffMission.id, action(oneOffMission));
    oneOffMission = await deliveries.progress(dc, oneOffMission.id, { ...action(oneOffMission), event: "DEPARTED" });
    oneOffMission = await deliveries.progress(dc, oneOffMission.id, { ...action(oneOffMission), event: "FINAL_DISTRIBUTION" });
    assert.equal(oneOffMission.phase, "FINAL_DISTRIBUTION");
    assert.equal(await db.collection.count({ where: { deliveryId: oneOffMission.id } }), 0);
    assert.equal((await stock()).physicalQuantity, 6);
    assert.equal((await stock()).reservedQuantity, 0);

    const mobile = { "X-DND-Client": "mobile", "Content-Type": "application/json" };
    const login = await timed("connexion_http", () => fetch(root + "/auth/login", {
      method: "POST", headers: mobile, body: JSON.stringify({ email: email("carrier"), password }),
    }));
    assert.equal(login.status, 200);
    const { accessToken } = await login.json() as { accessToken: string };
    assert.ok(accessToken);
    const headers = { ...mobile, Authorization: `Bearer ${accessToken}` };
    const organizations = await fetch(root + "/auth/organizations", { headers });
    assert.equal(organizations.status, 200);
    const choices = await organizations.json() as { organizations: Array<{ key: string; companyId?: string }> };
    const selected = choices.organizations.find(choice => choice.companyId === company.id);
    assert.ok(selected);
    const switched = await fetch(root + "/auth/switch-organization", {
      method: "POST", headers, body: JSON.stringify({ contextKey: selected.key }),
    });
    assert.equal(switched.status, 200);
    await switched.arrayBuffer();
    const httpReads: Record<string, { n: number; p95Ms: number; maxMs: number }> = {};
    for (const route of ["/health", "/ready", "/orders", "/reports/collections?preset=today"]) {
      const samples: number[] = [];
      const sample = async () => {
        const start = performance.now();
        const response = await fetch(root + route, { headers, signal: AbortSignal.timeout(5000) });
        assert.equal(response.status, 200, route);
        await response.arrayBuffer();
        return performance.now() - start;
      };
      await sample();
      for (let batch = 0; batch < 5; batch++)
        samples.push(...await Promise.all([sample(), sample()]));
      samples.sort((left, right) => left - right);
      httpReads[route] = { n: samples.length, p95Ms: Math.round(samples[Math.ceil(samples.length * 0.95) - 1]!), maxMs: Math.round(samples.at(-1)!) };
    }
    // Retain the synthetic photo on request for a coordinated backup/restore exercise.
    if (process.env.TEST_BACKUP_PROOF_DIR) {
      const target = resolve(process.env.TEST_BACKUP_PROOF_DIR);
      await mkdir(target, { recursive: true, mode: 0o700 });
      await copyFile(resolve(proofDir, file.storageKey), resolve(target, file.storageKey));
    }
    t.diagnostic(JSON.stringify({ operationsMs: timings, httpReads, stockFinal: 6, reservedFinal: 0, remittanceConfirmed: "50.1234" }));
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await smtp.close();
    await db.$disconnect();
    await disconnectDatabase();
    await rm(proofDir, { recursive: true, force: true });
  }
});
