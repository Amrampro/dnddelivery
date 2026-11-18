import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

test('installed picomatch rejects catastrophic single-branch repetitions', () => {
  const result = spawnSync(process.execPath, ['--input-type=commonjs', '-e', `
    const assert = require('node:assert/strict');
    const pm = require('picomatch');
    for (const options of [{}, {maxExtglobRecursion:false}]) {
      for (const pattern of ['+(*)b','+(*a)b','*(a*)b','+(**a)b']) {
        assert.equal(pm(pattern, options)('a'.repeat(80) + '!'), false);
      }
    }
    assert.equal(pm('src/**/*.ts')('src/auth/login.ts'), true);
    assert.equal(pm('*.@(js|ts)')('login.ts'), true);
    assert.equal(pm('+(a|b)')('abba'), true);
  `], { cwd: process.cwd(), timeout: 30_000, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('audit exception remains limited to the verified advisory', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dnd-audit-test-'));
  try {
    const cli = join(directory, 'audit.cjs');
    const script = fileURLToPath(new URL('../api/scripts/picomatch-security.mjs', import.meta.url));
    const advisory = { url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf' };
    const run = report => {
      writeFileSync(cli, `console.log(${JSON.stringify(JSON.stringify(report))}); process.exitCode = 1;`);
      return spawnSync(process.execPath, [script, 'audit'], {
        cwd: process.cwd(), env: {...process.env, npm_execpath: cli},
        timeout: 30_000, encoding: 'utf8',
      });
    };
    const known = {
      picomatch: { severity: 'high', via: [advisory], nodes: ['node_modules/picomatch'] },
      tinyglobby: { severity: 'high', via: ['picomatch'] },
    };
    const accepted = run({ vulnerabilities: known });
    assert.ifError(accepted.error);
    assert.equal(accepted.status, 0, accepted.stderr);
    for (const report of [
      { vulnerabilities: {...known, other: {severity:'high', via:[{url:'https://example.invalid/new-advisory'}]}} },
      { vulnerabilities: {...known, picomatch: {severity:'critical', via:[advisory, {url:'https://example.invalid/new-advisory'}]}} },
      { error: {code:'ENETWORK'} },
      { vulnerabilities: {...known, picomatch: {...known.picomatch, nodes:['node_modules/other/node_modules/picomatch']}} },
      { vulnerabilities: {loop: {severity:'high', via:['loop']}} },
    ]) {
      const blocked = run(report);
      assert.ifError(blocked.error);
      assert.notEqual(blocked.status, 0, 'Unknown or unavailable audit must block');
    }
  } finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir())) throw Error('Unsafe temporary cleanup path');
    rmSync(directory, {recursive:true, force:true});
  }
});
