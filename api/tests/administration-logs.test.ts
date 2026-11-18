import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { technicalEntries, technicalLog } from "../src/utils/technical-log.js";
import { authFixture, fixturePassword } from "./helpers/auth-fixture.js";
import { logsQuery } from "../src/modules/admin/logs.js";
import { reportJobResult, reportJobFailure } from "../src/utils/job-log.js";

test("technical logs remain readable without MySQL, filter and paginate deterministically", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "dnd-admin-logs-"));
  const previous = process.env.TECHNICAL_LOG_DIR;
  process.env.TECHNICAL_LOG_DIR = folder;
  try {
    const backupEvent = {
      action: "BACKUP_COMPLETED",
      result: "SUCCESS" as const,
      actorId: null,
      entityId: "backup-fixture",
      password: "forbidden-fixture-secret",
    };
    await technicalLog(backupEvent);
    await technicalLog({
      action: "JOB_FAILED",
      result: "FAILURE",
      actorId: null,
      entityId: "worker-fixture",
    });
    const eventFile = path.join(folder, new Date().toISOString().slice(0, 10) + ".jsonl");
    assert.ok(!(await readFile(eventFile, "utf8")).includes("forbidden-fixture-secret"));
    await writeFile(path.join(folder, "2000-01-01.jsonl"), "incomplete line\n");
    const all = await technicalEntries(1, 1);
    assert.equal(all.total, 2);
    const second = await technicalEntries(2, 1);
    assert.notEqual(all.items[0]?.id, second.items[0]?.id);
    assert.equal(
      (await technicalEntries(1, 20, undefined, undefined, "FAILURE")).items[0]
        ?.action,
      "JOB_FAILED",
    );
    assert.equal(
      (
        await technicalEntries(
          1,
          20,
          undefined,
          undefined,
          undefined,
          "backup-fixture",
        )
      ).total,
      1,
    );
    assert.equal(
      (await technicalEntries(1, 20, "2099-01-01T00:00:00.000Z")).total,
      0,
    );
    await reportJobResult({ sent: 2, failed: 1 });
    await reportJobFailure(new Error("must-not-log-a-private-error-message"));
    const failures = await technicalEntries(1, 20, undefined, undefined, "FAILURE");
    assert.ok(failures.items.some(item => item.action === "JOB_PARTIAL_FAILURE"));
    assert.ok(failures.items.some(item => item.action === "JOB_FAILED" && item.errorType === "Error"));
    assert.ok(!(await readFile(eventFile, "utf8")).includes("must-not-log-a-private-error-message"));
  } finally {
    if (previous === undefined) delete process.env.TECHNICAL_LOG_DIR;
    else process.env.TECHNICAL_LOG_DIR = previous;
    await rm(folder, { recursive: true, force: true });
  }
});

test("authentication logs identify the account and session without credentials", async () => {
  const fixture = await authFixture();
  const user = fixture.store.data.users.values().next().value!;
  const metadata = {
    client: "MOBILE" as const,
    deviceName: "Fixture",
    userAgent: null,
    ipHash: null,
  };
  await assert.rejects(
    fixture.service.login(user.email, "incorrect fixture password", metadata),
  );
  const failed = fixture.store.data.events.at(-1)!;
  assert.equal(failed.userId, user.id);
  assert.equal(failed.metadata.attemptedEmail, user.email);
  const bundle = await fixture.service.login(
    user.email,
    fixturePassword,
    metadata,
  );
  const success = fixture.store.data.events.at(-1)!;
  assert.equal(success.type, "LOGIN_SUCCESS");
  assert.ok(success.metadata.sessionId);
  await fixture.service.logout(bundle.refreshToken, "MOBILE");
  assert.equal(
    fixture.store.data.events.at(-1)?.metadata.sessionId,
    success.metadata.sessionId,
  );
  assert.ok(
    !JSON.stringify(fixture.store.data.events).includes(fixturePassword),
  );
  assert.ok(
    !JSON.stringify(fixture.store.data.events).includes(bundle.refreshToken),
  );
});

test("log filters reject invalid dates, ranges and unbounded pages", () => {
  for (const input of [
    { page: 0 },
    { size: 100000 },
    { from: "yesterday" },
    { from: "2026-12-01T00:00:00Z", to: "2026-01-01T00:00:00Z" },
  ])
    assert.equal(logsQuery.safeParse(input).success, false);
});
