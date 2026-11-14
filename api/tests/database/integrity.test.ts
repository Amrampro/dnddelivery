import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, scryptSync } from "node:crypto";
import { createDatabase } from "../../src/database/client.js";
import type { Prisma } from "../../src/generated/prisma/client.js";
import {
  authorizeTenant,
  AccessDenied,
} from "../../src/modules/authorization/tenant-access.js";
import { authorizationStore } from "../../src/repositories/authorization.repository.js";
import { ordersRepository } from "../../src/modules/orders/orders.repository.js";
import { reserveStock } from "../../src/modules/stocks/reserve-stock.js";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1)) ||
  process.env.NODE_ENV !== "test"
)
  throw new Error(
    "Use npm run test:db with an explicitly dedicated MySQL test database",
  );
const db = createDatabase(url);
const contact = {
  name: "Test fixture",
  email: "fixture@example.invalid",
  phone: "0000000000",
  address: "Test fixture address",
  city: "Fixture city",
};
async function fixture(tx: Prisma.TransactionClient) {
  const suffix = randomUUID();
  const company = await tx.company.create({
    data: {
      ...contact,
      reference: suffix,
      countryCode: "CM",
      status: "ACTIVE",
    },
  });
  const other = await tx.company.create({
    data: {
      ...contact,
      reference: randomUUID(),
      countryCode: "CM",
      status: "ACTIVE",
    },
  });
  const user = await tx.user.create({
    data: {
      email: `${suffix}@example.invalid`,
      fullName: "Test fixture",
      passwordHash: scryptSync("fixture-password", suffix, 64).toString("hex"),
    },
  });
  const role = await tx.role.create({
    data: { code: suffix, name: "Fixture company role", scope: "COMPANY" },
  });
  for (const code of ["orders.read", "stocks.reserve"]) {
    const permission = await tx.permission.upsert({
      where: { code },
      create: { code, description: "Fixture permission" },
      update: {},
    });
    await tx.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    });
  }
  await tx.companyMembership.create({
    data: { companyId: company.id, userId: user.id, roleId: role.id },
  });
  const agency = await tx.agency.create({
    data: { ...contact, companyId: company.id, reference: "TEST" },
  });
  const otherAgency = await tx.agency.create({
    data: { ...contact, companyId: other.id, reference: "TEST" },
  });
  const shop = await tx.shop.create({
    data: {
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      address: contact.address,
      reference: randomUUID(),
    },
  });
  await tx.companyShop.createMany({
    data: [
      { companyId: company.id, shopId: shop.id, status: "ACTIVE" },
      { companyId: other.id, shopId: shop.id, status: "ACTIVE" },
    ],
  });
  const product = await tx.product.create({
    data: { shopId: shop.id, sku: "SKU-TEST", name: "Fixture product" },
  });
  const stock = await tx.stock.create({
    data: {
      companyId: company.id,
      agencyId: agency.id,
      shopId: shop.id,
      productId: product.id,
      physicalQuantity: 5,
    },
  });
  const order = await tx.order.create({
    data: {
      companyId: company.id,
      shopId: shop.id,
      agencyId: agency.id,
      createdById: user.id,
      publicNumber: randomUUID(),
      type: "FROM_STOCK",
      recipientName: contact.name,
      recipientEmail: contact.email,
      recipientPhone: contact.phone,
      recipientAddress: contact.address,
      recipientCity: contact.city,
      amountToCollect: "1500.2500",
      collectionRequired: true,
      currency: "USD",
    },
  });
  const item = await tx.orderItem.create({
    data: {
      companyId: company.id,
      orderId: order.id,
      shopId: shop.id,
      productId: product.id,
      name: product.name,
      quantity: 4,
    },
  });
  return {
    company,
    other,
    user,
    role,
    agency,
    otherAgency,
    shop,
    product,
    stock,
    order,
    item,
  };
}
const rollback = new Error("Fixture transaction rollback");
test("MySQL relational integrity and tenant access", async (t) => {
  try {
    await db.$transaction(
      async (tx) => {
        const f = await fixture(tx);
        await t.test(
          "uniqueness is enforced within a company, references may repeat in another company",
          async () => {
            await assert.rejects(
              tx.agency.create({
                data: {
                  ...contact,
                  companyId: f.company.id,
                  reference: "TEST",
                },
              }),
            );
            assert.equal(f.otherAgency.reference, f.agency.reference);
          },
        );
        await t.test(
          "composite foreign keys reject a cross-company agency",
          async () => {
            await assert.rejects(
              tx.stock.create({
                data: {
                  companyId: f.other.id,
                  agencyId: f.agency.id,
                  shopId: f.shop.id,
                  productId: f.product.id,
                },
              }),
            );
          },
        );
        await t.test(
          "one shop participates in two companies without duplicated catalog",
          async () => {
            assert.equal(
              await tx.companyShop.count({ where: { shopId: f.shop.id } }),
              2,
            );
            assert.equal(
              await tx.product.count({ where: { shopId: f.shop.id } }),
              1,
            );
          },
        );
        await t.test(
          "tenant authorization rejects company membership laundering",
          async () => {
            const store = authorizationStore(tx);
            await authorizeTenant(
              store,
              { userId: f.user.id, companyId: f.company.id },
              "orders.read",
            );
            await assert.rejects(
              authorizeTenant(
                store,
                { userId: f.user.id, companyId: f.other.id },
                "orders.read",
              ),
              AccessDenied,
            );
            const agencyRole = await tx.role.create({
              data: {
                code: randomUUID(),
                name: "Fixture agency role",
                scope: "AGENCY",
              },
            });
            await assert.rejects(
              tx.agencyMembership.create({
                data: {
                  companyId: f.other.id,
                  agencyId: f.otherAgency.id,
                  userId: f.user.id,
                  roleId: agencyRole.id,
                },
              }),
            );
          },
        );
        await t.test(
          "CHECK constraints protect stock availability even outside ORM helpers",
          async () => {
            await assert.rejects(
              tx.stock.update({
                where: { id: f.stock.id },
                data: { reservedQuantity: 6 },
              }),
            );
            const after = await tx.stock.findUniqueOrThrow({
              where: { id: f.stock.id },
            });
            assert.equal(after.reservedQuantity, 0);
            await assert.rejects(
              tx.orderItem.create({
                data: {
                  companyId: f.company.id,
                  orderId: f.order.id,
                  shopId: f.shop.id,
                  name: "Invalid quantity",
                  quantity: 0,
                },
              }),
            );
          },
        );
        await t.test(
          "one-off order items do not require catalog or stock",
          async () => {
            const order = await tx.order.create({
              data: {
                companyId: f.company.id,
                shopId: f.shop.id,
                agencyId: f.agency.id,
                createdById: f.user.id,
                publicNumber: randomUUID(),
                type: "ONE_OFF",
                recipientName: contact.name,
                recipientEmail: contact.email,
                recipientPhone: contact.phone,
                recipientAddress: contact.address,
                recipientCity: contact.city,
                amountToCollect: "0",
                currency: "USD",
              },
            });
            await tx.orderItem.create({
              data: {
                companyId: f.company.id,
                orderId: order.id,
                shopId: f.shop.id,
                name: "One-off package",
                quantity: 1,
              },
            });
          },
        );
        await t.test(
          "delivery and financial states are independent, self-confirmation is rejected",
          async () => {
            const agencyRole = await tx.role.create({
              data: {
                code: randomUUID(),
                name: "Fixture courier role",
                scope: "AGENCY",
              },
            });
            await tx.agencyMembership.create({
              data: {
                companyId: f.company.id,
                agencyId: f.agency.id,
                userId: f.user.id,
                roleId: agencyRole.id,
              },
            });
            const delivery = await tx.delivery.create({
              data: {
                companyId: f.company.id,
                orderId: f.order.id,
                agencyId: f.agency.id,
                courierId: f.user.id,
                status: "IN_PROGRESS",
                assignedAt: new Date(),
              },
            });
            const otp = await tx.deliveryOtp.create({
              data: {
                companyId: f.company.id,
                deliveryId: delivery.id,
                courierId: f.user.id,
                codeHash: "a".repeat(64),
                expiresAt: new Date(Date.now() + 60000),
                status: "VERIFIED",
                verifiedAt: new Date(),
              },
            });
            await tx.deliveryProof.create({
              data: {
                companyId: f.company.id,
                deliveryId: delivery.id,
                courierId: f.user.id,
                otpId: otp.id,
                method: "OTP",
              },
            });
            await tx.delivery.update({
              where: { id: delivery.id },
              data: { status: "DELIVERED", closedAt: new Date() },
            });
            await assert.rejects(
              tx.deliveryProof.create({
                data: {
                  companyId: f.company.id,
                  deliveryId: delivery.id,
                  courierId: f.user.id,
                  otpId: otp.id,
                  method: "OTP",
                },
              }),
            );
            await assert.rejects(
              tx.delivery.update({
                where: { id: delivery.id },
                data: { status: "IN_PROGRESS" },
              }),
            );
            await assert.rejects(
              tx.deliveryOtp.update({
                where: { id: otp.id },
                data: { status: "PENDING" },
              }),
            );
            const collection = await tx.collection.create({
              data: {
                companyId: f.company.id,
                deliveryId: delivery.id,
                agencyId: f.agency.id,
                courierId: f.user.id,
                expectedAmount: "1500.2500",
                currency: "USD",
                status: "PENDING",
              },
            });
            assert.equal(collection.status, "PENDING");
            assert.equal(
              (
                await tx.delivery.findUniqueOrThrow({
                  where: { id: delivery.id },
                })
              ).status,
              "DELIVERED",
            );
            await assert.rejects(
              tx.remittance.create({
                data: {
                  companyId: f.company.id,
                  reference: randomUUID(),
                  agencyId: f.agency.id,
                  courierId: f.user.id,
                  declaredAmount: "1500.2500",
                  currency: "USD",
                  confirmedAmount: "1500.2500",
                  confirmedById: f.user.id,
                  confirmedAt: new Date(),
                  status: "CONFIRMED",
                },
              }),
            );
            const first = await tx.remittance.create({
              data: {
                companyId: f.company.id,
                reference: randomUUID(),
                agencyId: f.agency.id,
                courierId: f.user.id,
                declaredAmount: "1500.2500",
                currency: "USD",
              },
            });
            const second = await tx.remittance.create({
              data: {
                companyId: f.company.id,
                reference: randomUUID(),
                agencyId: f.agency.id,
                courierId: f.user.id,
                declaredAmount: "1500.2500",
                currency: "USD",
              },
            });
            const allocation = {
              companyId: f.company.id,
              collectionId: collection.id,
              courierId: f.user.id,
              agencyId: f.agency.id,
              currency: "USD",
            };
            await tx.remittanceItem.create({
              data: { ...allocation, remittanceId: first.id },
            });
            await assert.rejects(
              tx.remittanceItem.create({
                data: { ...allocation, remittanceId: second.id },
              }),
            );
          },
        );
        await t.test(
          "recipient snapshot cannot change after order creation",
          async () => {
            await assert.rejects(
              tx.order.update({
                where: { id: f.order.id },
                data: { recipientAddress: "Changed snapshot" },
              }),
            );
          },
        );
        throw rollback;
      },
      { timeout: 30000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
});
test("concurrent reservations cannot oversell; replay is idempotent and reads are scoped", async () => {
  // These random fixtures remain in the explicitly dedicated test database; no old data is deleted.
  const f = await db.$transaction((tx) => fixture(tx), { timeout: 30000 });
  // Bloc 6: this stock-concurrency fixture explicitly has a valid test subscription.
  const fixturePlan=await db.subscriptionPlan.create({data:{code:randomUUID(),name:'Stock test only',active:false}});
  await db.subscription.create({data:{companyId:f.company.id,planId:fixturePlan.id,status:'ACTIVE',startedAt:new Date(Date.now()-86400000),expiresAt:new Date(Date.now()+86400000)}});
  const secondOrder = await db.order.create({
    data: {
      companyId: f.company.id,
      shopId: f.shop.id,
      agencyId: f.agency.id,
      createdById: f.user.id,
      publicNumber: randomUUID(),
      type: "FROM_STOCK",
      recipientName: contact.name,
      recipientEmail: contact.email,
      recipientPhone: contact.phone,
      recipientAddress: contact.address,
      recipientCity: contact.city,
      amountToCollect: "0",
      currency: "USD",
    },
  });
  const secondItem = await db.orderItem.create({
    data: {
      companyId: f.company.id,
      orderId: secondOrder.id,
      shopId: f.shop.id,
      productId: f.product.id,
      name: "Second item",
      quantity: 4,
    },
  });
  const ctx = await authorizeTenant(
    authorizationStore(db),
    { userId: f.user.id, companyId: f.company.id },
    "stocks.reserve",
  );
  const requests = [
    {
      stockId: f.stock.id,
      orderItemId: f.item.id,
      quantity: 4,
      idempotencyKey: randomUUID(),
    },
    {
      stockId: f.stock.id,
      orderItemId: secondItem.id,
      quantity: 4,
      idempotencyKey: randomUUID(),
    },
  ];
  const results = await Promise.allSettled(
    requests.map((value) => reserveStock(db, ctx, value)),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const after = await db.stock.findUniqueOrThrow({ where: { id: f.stock.id } });
  assert.equal(after.reservedQuantity, 4);
  assert.equal(after.physicalQuantity, 5);
  const index = results.findIndex((r) => r.status === "fulfilled");
  const input = requests[index];
  assert.ok(input);
  await reserveStock(db, ctx, input);
  assert.equal(
    (await db.stock.findUniqueOrThrow({ where: { id: f.stock.id } }))
      .reservedQuantity,
    4,
  );
  await assert.rejects(reserveStock(db, ctx, { ...input, quantity: 3 }));
  const read = await authorizeTenant(
    authorizationStore(db),
    { userId: f.user.id, companyId: f.company.id },
    "orders.read",
  );
  const otherOrder = await db.order.create({
    data: {
      companyId: f.other.id,
      shopId: f.shop.id,
      agencyId: f.otherAgency.id,
      createdById: f.user.id,
      publicNumber: randomUUID(),
      type: "ONE_OFF",
      recipientName: contact.name,
      recipientEmail: contact.email,
      recipientPhone: contact.phone,
      recipientAddress: contact.address,
      recipientCity: contact.city,
      amountToCollect: "0",
      currency: "USD",
    },
  });
  assert.equal(await ordersRepository(db).findById(read, otherOrder.id), null);
  assert.equal(
    (await ordersRepository(db).findById(read, f.order.id))?.id,
    f.order.id,
  );
});
after(async () => {
  await db.$disconnect();
});
