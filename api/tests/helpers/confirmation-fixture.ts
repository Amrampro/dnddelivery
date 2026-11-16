import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { createDatabase } from "../../src/database/client.js";
import { ConfirmationService } from "../../src/modules/confirmation/service.js";
import {
  TrackingService,
  trackingLink,
} from "../../src/modules/confirmation/tracking.js";
import { LocalProofStorage } from "../../src/modules/confirmation/storage.js";
import { DeliveryService } from "../../src/modules/deliveries/service.js";
import { OrderService } from "../../src/modules/orders/service.js";
import { FinancialService } from "../../src/modules/collections/service.js";
import { creation } from "../../src/modules/orders/validation.js";
import type { Context } from "../../src/modules/deliveries/access.js";
export async function confirmationFixture(companyCouriers = false) {
  const url = process.env.TEST_DATABASE_URL;
  if (
    !url ||
    process.env.NODE_ENV !== "test" ||
    !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1))
  )
    throw Error("Dedicated test database required");
  const db = createDatabase(url),
    suffix = randomUUID().slice(0, 8),
    key = () => randomUUID();
  const role = async (code: string) =>
    (await db.role.findUniqueOrThrow({ where: { code } })).id;
  const user = async (name: string) =>
    db.user.create({
      data: {
        fullName: name,
        email: `proof-${name}-${suffix}@example.invalid`,
        passwordHash: "Not a login fixture",
      },
    });
  const admin = await user("admin"),
    approver = await user("approver"),
    manager = await user("manager"),
    courier = await user("courier"),
    peer = await user("peer"),
    owner = await user("owner"),
    outsider = await user("other-owner");
  const contact = {
    email: "proof@example.invalid",
    phone: "+237699123456",
    address: "Address for confirmation tests",
    city: "Douala",
    countryCode: "CM",
  };
  const company = await db.company.create({
      data: {
        ...contact,
        name: "Proof carrier",
        reference: `PROOF-${suffix}`,
        status: "ACTIVE",
      },
    }),
    other = await db.company.create({
      data: {
        ...contact,
        name: "Other proof carrier",
        reference: `PROOF-X-${suffix}`,
        status: "ACTIVE",
      },
    });
  const agency = await db.agency.create({
      data: {
        ...contact,
        name: "Proof agency",
        reference: "A",
        companyId: company.id,
      },
    }),
    otherAgency = await db.agency.create({
      data: {
        ...contact,
        name: "Other agency",
        reference: "B",
        companyId: company.id,
      },
    });
  for (const u of [admin, approver])
    for (const companyId of [company.id, other.id])
      await db.companyMembership.create({
        data: { companyId, userId: u.id, roleId: await role("company_admin") },
      });
  for (const [u, code] of [
    [manager, "agency_manager"],
    [courier, "courier"],
    [peer, "courier"],
  ] as const) {
    await db.companyMembership.create({
      data: {
        companyId: company.id,
        userId: u.id,
        roleId: await role(
          companyCouriers && code === "courier"
            ? "company_courier"
            : "company_member",
        ),
        ...(code === "courier" ? { organizationRole: "courier" } : {}),
      },
    });
    if (!companyCouriers || code !== "courier")
      await db.agencyMembership.create({
        data: {
          companyId: company.id,
          agencyId: agency.id,
          userId: u.id,
          roleId: await role(code),
        },
      });
    if (code === "courier")
      await db.driverProfile.create({
        data: {
          companyId: company.id,
          userId: u.id,
          status: "ACTIVE",
          availability: "AVAILABLE",
        },
      });
  }
  const shop = await db.shop.create({
      data: {
        reference: `PROOF-S-${suffix}`,
        name: "Proof shop",
        email: owner.email,
        phone: contact.phone,
        address: contact.address,
      },
    }),
    otherShop = await db.shop.create({
      data: {
        reference: `PROOF-SS-${suffix}`,
        name: "Other shop",
        email: outsider.email,
        phone: contact.phone,
        address: contact.address,
      },
    });
  for (const [u, sh] of [
    [owner, shop],
    [outsider, otherShop],
  ] as const)
    await db.shopMembership.create({
      data: { shopId: sh.id, userId: u.id, roleId: await role("shop_owner") },
    });
  await db.companyShop.create({
    data: {
      companyId: company.id,
      shopId: shop.id,
      status: "ACTIVE",
      allowedAgencyIds: [agency.id, otherAgency.id],
    },
  });
  const plan = await db.subscriptionPlan.findFirstOrThrow({
    where: { active: true },
  });
  for (const companyId of [company.id, other.id])
    await db.subscription.create({
      data: {
        companyId,
        planId: plan.id,
        status: "ACTIVE",
        startedAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 20 * 86400000),
      },
    });
  const cc: Context = {
      actorId: admin.id,
      scope: "COMPANY",
      companyId: company.id,
    },
    ac: Context = {
      actorId: manager.id,
      scope: "AGENCY",
      companyId: company.id,
      agencyId: agency.id,
    },
    dc: Context = {
      actorId: courier.id,
      scope: companyCouriers ? "COMPANY" : "AGENCY",
      companyId: company.id,
      agencyId: companyCouriers ? undefined : agency.id,
    },
    ec: Context = { ...dc, actorId: peer.id },
    sc: Context = { actorId: owner.id, scope: "SHOP", shopId: shop.id },
    xc: Context = { actorId: outsider.id, scope: "SHOP", shopId: otherShop.id },
    vc: Context = { ...cc, actorId: approver.id };
  const files = new LocalProofStorage(
      path.resolve(`../.local-preserved/bloc13/test-files-${suffix}`),
    ),
    s = new ConfirmationService(db, files),
    tracking = new TrackingService(db),
    d = new DeliveryService(db),
    orders = new OrderService(db),
    finance = new FinancialService(db);
  const action = (p: { version: number }) => ({
    version: p.version,
    operationKey: key(),
    reason: "Confirmation test decision",
  });
  async function fresh(expected = "0", engage = true, agencyId = agency.id) {
    const o = await orders.create(
      sc,
      creation.parse({
        companyId: company.id,
        shopId: shop.id,
        agencyId,
        clientKey: key(),
        type: "ONE_OFF",
        recipient: {
          name: "Private recipient",
          email: `recipient-${suffix}@example.invalid`,
          phone: "+237699123456",
          country: "Cameroun",
          city: "Douala",
          address: "Private recipient address",
        },
        items: [{ name: "Parcel", quantity: 1 }],
        pickup: {
          address: "Pickup address",
          contact: "Shop keeper",
          phone: "+237699123456",
        },
        parcelDescription: "Sealed parcel",
        collectionRequired: expected !== "0",
        amountToCollect: expected,
        currency: "XAF",
      }),
    );
    let p = await d.create(cc, {
      orderId: o.id,
      orderVersion: o.version,
      operationKey: key(),
    });
    p = await d.assign(cc, p.id, { ...action(p), courierId: courier.id });
    if (engage) {
      p = await d.pickup(dc, p.id, action(p));
      p = await d.progress(dc, p.id, {
        ...action(p),
        event: "FINAL_DISTRIBUTION",
      });
    }
    return p;
  }
  async function recipient(id: string) {
    const p = await db.delivery.findUniqueOrThrow({
        where: { id },
        include: { order: true },
      }),
      link = await db.$transaction((tx) => trackingLink(tx, p.order)),
      params = new URLSearchParams(new URL(link).hash.slice(1)),
      raw = params.get("token")!,
      grant = await tracking.verify(
        p.order.publicNumber,
        raw,
        "recipient-test-" + id,
      );
    return {
      reference: p.order.publicNumber,
      raw,
      session: grant.session,
      order: p.order,
      link,
    };
  }
  async function code(id: string) {
    const r = await recipient(id);
    return (await tracking.code(r.reference, r.session)).code;
  }
  async function photo(
    id: string,
    color = "#00aa55",
    kind: "HANDOVER" | "FAILURE" = "HANDOVER",
  ) {
    const bytes = await sharp({
      create: { width: 80, height: 60, channels: 3, background: color },
    })
      .withMetadata({ exif: { IFD0: { Artist: "Private device metadata" } } })
      .jpeg()
      .toBuffer();
    return s.upload(dc, id, { operationKey: key(), kind }, bytes, "image/jpeg");
  }
  async function verified(id: string) {
    const otp = await code(id),
      p = await s.confirmation(dc, id);
    return s.verifyCode(dc, id, { ...action(p), code: otp });
  }
  return {
    db,
    s,
    tracking,
    d,
    orders,
    finance,
    files,
    company,
    other,
    agency,
    otherAgency,
    shop,
    admin,
    approver,
    manager,
    courier,
    peer,
    owner,
    cc,
    ac,
    dc,
    ec,
    sc,
    xc,
    vc,
    key,
    action,
    fresh,
    recipient,
    code,
    photo,
    verified,
  };
}
