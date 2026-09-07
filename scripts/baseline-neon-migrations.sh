#!/usr/bin/env bash
# One-time: mark all existing migrations as applied on a Neon DB that was created with db push.
# Use the Neon DIRECT (non-pooled) URL — required for migration commands.
#
#   export DATABASE_URL="postgresql://...@...neon.tech/neondb?sslmode=require"
#   bash scripts/baseline-neon-migrations.sh
#
# After this, you can switch vercel-build to migrate deploy if you prefer.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Set DATABASE_URL to your Neon direct connection string first."
  exit 1
fi

for dir in prisma/migrations/*/; do
  name="$(basename "$dir")"
  [ "$name" = "migration_lock.toml" ] && continue
  echo "Marking applied: $name"
  npx prisma migrate resolve --applied "$name"
done

echo "Done. prisma migrate deploy should now succeed on this database."
