#!/bin/sh
set -e

echo "🔄 Running Prisma migrations..."
npx prisma migrate deploy

ROLE="${THESIUM_ROLE:-api}"

if [ "$ROLE" = "worker" ]; then
  echo "👷 Starting Thesium worker..."
  exec npx tsx server/worker-entry.ts
else
  echo "🚀 Starting Thesium API server..."
  exec npx tsx server/index.ts
fi
