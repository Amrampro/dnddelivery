import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const load = createRequire(import.meta.url);
const decode = load("decode-uri-component") as (value: string) => string;

test("security: URI decoder preserves the CommonJS API, UTF-8, malformed bytes and plus signs", () => {
  assert.equal(decode("Douala+%C3%A9%20%F0%9F%9A%9A"), "Douala é 🚚");
  assert.equal(decode("%FF%41"), "%FFA");
  assert.equal(decode("%FE%FF"), "\uFFFD\uFFFD");
  assert.throws(() => decode(null as unknown as string), TypeError);
  const query = load("query-string") as { parse: (s: string) => object };
  assert.deepEqual({ ...query.parse("name=Douala+%C3%A9&broken=%FF%41") }, { name: "Douala é", broken: "%FFA" });
});
test("security: malformed URI runs complete within a bounded child process", () => {
  execFileSync(process.execPath, ["-e", "const d=require('decode-uri-component');const x='%FF%41'.repeat(20000);if(d(x)!=='%FFA'.repeat(20000))process.exit(1)"], { timeout: 5000, stdio: "pipe" });
});
