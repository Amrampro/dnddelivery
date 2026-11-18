import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';

// Temporary mitigation for GHSA-fc5q-39xc-vjpf, which has no upstream release.
// Reject ambiguous single-branch wildcard repetition using the parser's existing
// literal fallback. Ordinary globs and literal extglob alternatives are unchanged.
const originalHash = '4e1e05447668aa1e94366c5516a2bcd8f5fff800cc92b1d0cd7d77703b8618c4';
const anchor = 'const analyzeRepeatedExtglob = (body, options) => {';
const mitigation = `${anchor}\n  // DND GHSA-fc5q-39xc-vjpf: never repeat a wildcard-bearing single branch.\n  if (splitTopLevel(body).length === 1 && body.includes('*')) {\n    return { risky: true };\n  }\n`;
const file = resolve('node_modules/picomatch/lib/parse.js');
const hash = source => createHash('sha256').update(source).digest('hex');
const mode = process.argv[2];
if (!existsSync(file)) {
  if (mode !== 'install') throw Error('Full dependency installation required for security verification');
} else {
  const source = readFileSync(file, 'utf8');
  const unpatched = source.includes(mitigation) ? source.replace(mitigation, anchor) : source;
  if (hash(unpatched) !== originalHash) throw Error('Picomatch source changed. Review and retire/update the temporary mitigation.');
  if (mode === 'install') writeFileSync(file, unpatched.replace(anchor, mitigation));
  else if (!source.includes(mitigation)) throw Error('Picomatch mitigation missing. Run npm ci.');
}
if (mode === 'audit') {
  // Expiring exception applies ONLY to this mitigated advisory, including npm's
  // transitive meta-vulnerabilities. Every other high/critical advisory blocks CI.
  if (Date.now() > Date.parse('2026-12-18T00:00:00Z')) throw Error('Review the expiring picomatch mitigation and upstream release.');
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'audit', '--json'], { encoding: 'utf8' });
  if (result.error || result.signal || ![0, 1].includes(result.status))
    throw result.error || Error('Audit interrupted or unavailable');
  const report = JSON.parse(result.stdout);
  if (report.error || !report.vulnerabilities) throw Error('Audit unavailable. No security result accepted.');
  const covered = (name, visited = new Set()) => {
    if (visited.has(name)) return false;
    const entry = report.vulnerabilities[name];
    if (!entry?.via?.length) return false;
    if (name === 'picomatch' &&
        (!entry.nodes?.length || entry.nodes.some(node => node !== 'node_modules/picomatch'))) return false;
    const next = new Set([...visited, name]);
    return entry.via.every(via => typeof via === 'string'
      ? covered(via, next)
      : name === 'picomatch' && via.url === 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf');
  };
  const blocked = Object.entries(report.vulnerabilities).filter(([name, entry]) =>
    ['high', 'critical'].includes(entry.severity) && !covered(name));
  if (blocked.length) {
    console.error(JSON.stringify(Object.fromEntries(blocked), null, 2));
    process.exitCode = 1;
  } else {
    console.log('Security audit passed. Known picomatch advisory locally mitigated until 2026-12-18; all other high/critical advisories remain blocking.');
  }
}
