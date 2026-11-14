import 'dotenv/config';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import { mkdirSync, chmodSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const url = new URL(process.env.DATABASE_URL || 'missing:');
if (url.protocol !== 'mysql:' || !url.pathname.slice(1)) throw new Error('DATABASE_URL is required for backup');
// This deployment targets the local MariaDB server only; no unverified remote TLS.
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Configure a verified backup transport before using a remote database');
const directory = resolve('.backups');
mkdirSync(directory, { recursive: true, mode: 0o700 });
chmodSync(directory, 0o700);
const file = join(directory, `${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
const result = spawnSync('mariadb-dump', [
  '--single-transaction', '--skip-lock-tables', '--triggers',
  '--host', url.hostname, '--port', url.port || '3306',
  '--user', decodeURIComponent(url.username), '--result-file', file,
  decodeURIComponent(url.pathname.slice(1)),
], { env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }, stdio: 'pipe' });
if (result.status !== 0) {
  rmSync(file, { force: true });
  // Only emit error codes: dump output can contain database identifiers.
  const databaseCode = result.stderr?.toString().match(/(?:ERROR|Got error:)\s*(\d+)/i)?.[1];
  const reason = result.error?.code || (databaseCode ? `database error ${databaseCode}` : `exit ${result.status}`);
  throw new Error(`Database backup failed (${reason}); migration blocked. Check mariadb-dump and database permissions.`);
}
chmodSync(file, 0o600);
console.log('Private database backup completed.');
