import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import { smtpMailer, invitationMailer } from "../src/modules/auth/smtp.js";
test("configured SMTP transport delivers a reset message to a local-only test sink", async () => {
  let received = "";
  const sockets = new Set<import("node:net").Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.setEncoding("utf8");
    socket.write("220 localhost SMTP test sink\r\n");
    let buffer = "",
      data = false;
    socket.on("data", (chunk) => {
      buffer += chunk;
      while (true) {
        const end = buffer.indexOf("\r\n");
        if (end < 0) break;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") {
            data = false;
            socket.write("250 Message accepted\r\n");
          } else received += line + "\n";
        } else if (line.startsWith("EHLO") || line.startsWith("HELO"))
          socket.write("250 localhost\r\n");
        else if (
          line.startsWith("MAIL") ||
          line.startsWith("RCPT") ||
          line.startsWith("RSET")
        )
          socket.write("250 OK\r\n");
        else if (line === "DATA") {
          data = true;
          socket.write("354 End data\r\n");
        } else if (line === "QUIT") {
          socket.end("221 Bye\r\n");
        } else socket.write("250 OK\r\n");
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const mailer = smtpMailer({
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: address.port,
      SMTP_FROM: "sender@example.invalid",
      SMTP_SECURE: "false",
    });
    assert.ok(mailer.available());
    await mailer.send("recipient@example.invalid", {
      web: "http://localhost/reinitialisation#token=isolated-test-token",
      mobile: "dnddelivery://reinitialisation?token=isolated-test-token",
    });
    assert.match(received, /Subject:/);
    assert.ok(received.replace(/=\r?\n/g, "").includes("isolated-test-token"));
    await invitationMailer({
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: address.port,
      SMTP_FROM: "sender@example.invalid",
      SMTP_SECURE: "false",
    }).send(
      "invited@example.invalid",
      "http://localhost/invitation#token=isolated-invitation-token",
      "Test SMTP entreprise",
    );
    assert.ok(
      received.replace(/=\r?\n/g, "").includes("isolated-invitation-token"),
    );
    assert.equal(smtpMailer({}).available(), false);
    assert.equal(
      smtpMailer({
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: address.port,
        SMTP_FROM: "sender@example.invalid",
        SMTP_USER: "unpaired",
      }).available(),
      false,
    );
    await assert.rejects(
      smtpMailer({
        NODE_ENV: "production",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: address.port,
        SMTP_FROM: "sender@example.invalid",
        SMTP_SECURE: "false",
      }).send("recipient@example.invalid", {
        web: "must-not-be-sent-clear",
        mobile: "must-not-be-sent-clear",
      }),
    );
    assert.ok(!received.includes("must-not-be-sent-clear"));
  } finally {
    for (const s of sockets) s.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
