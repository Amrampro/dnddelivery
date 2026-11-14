#!/bin/bash
set -euo pipefail
umask 027
cd "$(dirname "$0")/.."
export PATH="/opt/plesk/node/24/bin:$PATH"
export NODE_ENV=production
export DATABASE_ENGINE=mariadb
# Plesk's Git hook does not inherit the Node.js page's environment variables.
# A private .env must therefore exist in the application root before deployment.
test -s .env || { echo 'Missing private API .env; deployment stopped.' >&2; exit 1; }
test -f public/index.html
test -f dist/server.js
exec 9>.deployment.lock
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
npm ci --include=dev --no-audit --no-fund
npm run db:generate
npm run db:validate
node scripts/backup-database.mjs
npm run db:migrate:deploy
npm run db:migrate:status
mkdir -p tmp
touch tmp/restart.txt
echo 'Dependencies and migrations ready; Passenger restart requested.'
