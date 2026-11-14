import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, '.local-preserved/plesk-release');
if (existsSync(output)) throw new Error('Release directory already exists; archive it before packaging again.');
for (const file of ['api/dist/server.js', 'webapp/dist/index.html']) {
  if (!existsSync(join(root, file))) throw new Error(`Build missing: ${file}`);
}
mkdirSync(output, { recursive: true });
// Explicit allowlist: API .env, storage, tests and local files are never copied.
for (const path of ['dist', 'src', 'prisma', 'prisma.config.ts', 'package.json', 'package-lock.json', '_passenger.cjs']) {
  cpSync(join(root, 'api', path), join(output, path), { recursive: true });
}
mkdirSync(join(output, 'scripts'));
for (const path of ['migrate-deploy.ts', 'migration-files.ts', 'bootstrap-super-admin.ts', 'plesk-deploy.sh', 'backup-database.mjs']) {
  cpSync(join(root, 'api/scripts', path), join(output, 'scripts', path));
}
cpSync(join(root, 'webapp/dist'), join(output, 'public'), { recursive: true });
writeFileSync(join(output, '.gitignore'), 'node_modules/\n.env\n.env.*\nstorage/\ntmp/\n.backups/\n.deployment.lock\n');
writeFileSync(join(output, 'release.json'), JSON.stringify({ commit: process.env.GITHUB_SHA || 'local', builtAt: new Date().toISOString() }) + '\n');
console.log('Prepared .local-preserved/plesk-release');
