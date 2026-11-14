import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankOrder,
  orderValidation,
  orderCan,
  orderForm,
  orderPayload,
} from "./orders.ts";
const valid = () => ({
  ...blankOrder("company", "shop", "agency"),
  recipient: {
    name: "Amina",
    email: "amina@example.com",
    phone: "+14155552671",
    country: "USA",
    city: "San Francisco",
    address: "10 Market Street",
  },
  pickup: {
    address: "20 Market Street",
    contact: "Shop",
    phone: "+32470123456",
  },
  items: [{ name: "Package", quantity: 1 }],
  parcelDescription: "Shoes",
});
test("order form validates international recipients and both delivery types", () => {
  assert.equal(orderValidation(valid()), "");
  assert.match(
    orderValidation({
      ...valid(),
      recipient: { ...valid().recipient, phone: "699123456" },
    }),
    /international/,
  );
  assert.match(
    orderValidation({ ...valid(), type: "FROM_STOCK" }),
    /catalogue/,
  );
  assert.equal(
    orderValidation({
      ...valid(),
      type: "FROM_STOCK",
      items: [{ name: "Shirt", productId: "product", quantity: 2 }],
    }),
    "",
  );
});
test("collection uses decimal strings and rejects inconsistent or imprecise input", () => {
  assert.equal(
    orderValidation({
      ...valid(),
      collectionRequired: true,
      amountToCollect: "123456789012345.1234",
    }),
    "",
  );
  for (const amount of ["1e5", "1,25", "-5", "0", "1.00001"])
    assert.notEqual(
      orderValidation({
        ...valid(),
        collectionRequired: true,
        amountToCollect: amount,
      }),
      "",
    );
  assert.notEqual(orderValidation({ ...valid(), amountToCollect: "2" }), "");
});
test("step validation preserves incomplete later steps without submitting them", () => {
  const x = blankOrder("c", "s", "a");
  assert.equal(orderValidation(x, 0), "");
  assert.notEqual(orderValidation(x), "");
  assert.notEqual(
    orderValidation({ ...valid(), items: [{ name: "X", quantity: 1.5 }] }),
    "",
  );
});
test("write actions use effective explicit rights and subscription", () => {
  const shop = { scope: "SHOP", permissions: ["orders.create"] };
  assert.equal(orderCan(shop, "create"), false);
  assert.equal(
    orderCan({ ...shop, permissions: ["shop.orders.create"] }, "create"),
    true,
  );
  assert.equal(
    orderCan(
      {
        ...shop,
        permissions: ["shop.orders.create"],
        subscriptionAccess: { valid: false },
      },
      "create",
    ),
    false,
  );
});
test("editing an order keeps snapshot data and monetary precision", () => {
  const p = {
    ...valid(),
    recipientDetails: valid().recipient,
    orderItem_orderRecords: [
      {
        id: "i",
        productId: null,
        name: "Shoes",
        quantity: 3,
        sku: null,
        description: null,
        instructions: null,
        declaredValue: "20.1234",
      },
    ],
  };
  const x = orderForm(p);
  assert.equal(x.recipient.name, "Amina");
  assert.equal(x.items[0].declaredValue, "20.1234");
  assert.equal(x.items[0].productId, undefined);
  const timed = {
    ...valid(),
    recipient: {
      ...valid().recipient,
      desiredDeliveryAt: "2026-10-30T14:00:00+01:00",
    },
  };
  assert.equal(
    orderPayload(timed).recipient.desiredDeliveryAt,
    "2026-10-30T13:00:00.000Z",
  );
});
