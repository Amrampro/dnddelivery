// Local visual-test harness. Never imported by application code.
import { writeFile } from "node:fs/promises";
import { confirmationFixture } from "./helpers/confirmation-fixture.js";
import { hashPassword } from "../src/modules/auth/crypto.js";
if (
  process.env.DND_CUSTOMER_TEST_PREVIEW !== "1" ||
  process.env.NODE_ENV !== "test"
)
  throw Error("Customer preview is disabled");
const f = await confirmationFixture(true);
const mission = await f.fresh();
const order = await f.db.order.findUniqueOrThrow({
  where: { id: mission.orderId },
});
const password = "Local-preview-only-2026!";
const user = await f.db.user.create({
  data: {
    email: order.recipientEmail,
    fullName: "Camille · compte de test",
    phone: "+237699123456",
    passwordHash: await hashPassword(password),
    customerEnabled: true,
    emailVerifiedAt: new Date(),
  },
});
await f.db.order.update({
  where: { id: order.id },
  data: { customerUserId: user.id },
});
await writeFile(
  "../.local-preserved/customer-preview.json",
  JSON.stringify({
    email: user.email,
    password,
    reference: order.publicNumber,
  }),
);
const { app } = await import("../src/app.js");
app.listen(4319, "127.0.0.1", () =>
  console.log("Customer visual test ready on loopback port 4319."),
);
