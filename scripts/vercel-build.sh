#!/usr/bin/env bash
# Vercel build: Neon was provisioned with `prisma db push` (no _prisma_migrations table).
# `migrate deploy` fails with P3005 on a non-empty database without migration history.
# AWS RDS uses `migrate deploy` in Dockerfile where migrations were applied from the start.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npx prisma generate

if [ -n "${VERCEL:-}" ] || [ "${PRISMA_SYNC_STRATEGY:-}" = "push" ]; then
  echo "Syncing Neon schema with prisma db push..."
  npx prisma db push --skip-generate --accept-data-loss
else
  echo "Applying migrations with prisma migrate deploy..."
  npx prisma migrate deploy
fi

npm run build
