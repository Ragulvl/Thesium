#!/bin/sh
set -e

echo "🔄 Running Prisma migrations..."
npx prisma migrate deploy

ROLE="${THESIUM_ROLE:-api}"

if [ "$ROLE" = "worker" ]; then
  echo "👷 Starting Thesium worker..."
  exec node dist/server/worker-entry.js
else
  echo "🚀 Starting Thesium API server..."
  exec node dist/server/index.js
fi
