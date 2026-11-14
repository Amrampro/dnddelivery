import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import cookieParser from "cookie-parser";
import { authFixture, fixturePassword } from "./helpers/auth-fixture.js";
import { createAuthRouter } from "../src/modules/auth/auth.routes.js";
import { errors } from "../src/middlewares/errors.js";
async function harness() {
  const f = await authFixture(),
    app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    "/api/auth",
    createAuthRouter(() => f.service, ["http://localhost:5173"]),
  );
  app.use(errors);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/auth`;
  let cookies = "";
  const request = async (
    path: string,
    method = "GET",
    body?: unknown,
    csrf?: string,
    origin = "http://localhost:5173",
  ) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        Origin: origin,
        "X-DND-Client": "web",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookies ? { Cookie: cookies } : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const set = res.headers.getSetCookie();
    if (set.length) cookies = set.map((c) => c.split(";")[0]).join("; ");
    return res;
  };
  return {
    ...f,
    request,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
test("HTTP cookies, protected profile, CSRF, context checks and logout", async () => {
  const h = await harness();
  try {
    assert.equal((await h.request("/me")).status, 401);
    const login = await h.request("/login", "POST", {
      email: "auth-fixture@example.invalid",
      password: fixturePassword,
    });
    assert.equal(login.status, 200);
    const data = await login.json();
    assert.ok(!("refreshToken" in data));
    assert.ok(!("accessToken" in data));
    for (const cookie of login.headers.getSetCookie()) {
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Lax/i);
    }
    const profile = await h.request("/me");
    assert.equal(profile.status, 200);
    assert.equal((await profile.json()).organizations.length, 2);
    assert.equal((await h.request("/workspace")).status, 403);
    assert.equal(
      (
        await h.request("/switch-organization", "POST", {
          contextKey: h.choices[0]!.key,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await h.request(
          "/switch-organization",
          "POST",
          { contextKey: h.choices[0]!.key },
          data.csrfToken,
          "https://hostile.invalid",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await h.request(
          "/switch-organization",
          "POST",
          { contextKey: h.choices[0]!.key },
          data.csrfToken,
        )
      ).status,
      200,
    );
    assert.equal((await h.request("/workspace")).status, 200);
    assert.equal(
      (await h.request("/workspace?permission=orders.read")).status,
      200,
    );
    assert.equal(
      (await h.request("/workspace?permission=platform.manage")).status,
      403,
    );
    assert.equal(
      (await h.request("/workspace?permission=stocks.read")).status,
      403,
    );
    assert.equal(
      (await h.request("/workspace?permission[]=orders.read")).status,
      400,
    );
    assert.equal(
      (
        await h.request(
          "/me",
          "PATCH",
          { fullName: "Fixture", phone: null, role: "super_admin" },
          data.csrfToken,
        )
      ).status,
      400,
    );
    h.store.data.agencyGrants.get(
      `${h.userId}:${h.companyA}:${h.agencyA}`,
    )!.active = false;
    assert.equal((await h.request("/workspace")).status, 403);
    assert.equal(
      (await h.request("/logout", "POST", {}, data.csrfToken)).status,
      204,
    );
    assert.equal((await h.request("/me")).status, 401);
  } finally {
    await h.close();
  }
});
test("HTTP browser restoration rotates cookies after access expiry", async () => {
  const h = await harness();
  try {
    const login = await h.request("/login", "POST", {
        email: "auth-fixture@example.invalid",
        password: fixturePassword,
      }),
      data = await login.json();
    h.advance(61000);
    assert.equal((await h.request("/me")).status, 401);
    assert.equal((await h.request("/csrf")).status, 200);
    assert.equal(
      (await h.request("/refresh", "POST", {}, data.csrfToken)).status,
      200,
    );
    assert.equal((await h.request("/me")).status, 200);
    assert.equal(
      (await h.request("/logout-all", "POST", {}, data.csrfToken)).status,
      204,
    );
    assert.equal((await h.request("/me")).status, 401);
  } finally {
    await h.close();
  }
});
test("HTTP recovery has generic responses and reports missing SMTP globally", async () => {
  const h = await harness();
  try {
    const a = await h.request("/forgot-password", "POST", {
        email: "auth-fixture@example.invalid",
      }),
      b = await h.request("/forgot-password", "POST", {
        email: "unknown@example.invalid",
      });
    assert.equal(a.status, 202);
    assert.deepEqual(await a.json(), await b.json());
    h.disableMail();
    for (const email of [
      "auth-fixture@example.invalid",
      "unknown@example.invalid",
    ])
      assert.equal(
        (await h.request("/forgot-password", "POST", { email })).status,
        503,
      );
  } finally {
    await h.close();
  }
});
test("HTTP login rate limiter blocks repeated attempts", async () => {
  const h = await harness();
  try {
    let last = 0;
    for (let i = 0; i < 13; i++)
      last = (
        await h.request("/login", "POST", {
          email: "unknown@example.invalid",
          password: "wrong",
        })
      ).status;
    assert.equal(last, 429);
  } finally {
    await h.close();
  }
});
