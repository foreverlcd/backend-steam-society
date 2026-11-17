#!/usr/bin/env bash
# Restore a dump made by db-backup.sh into a target database.
#   scripts/db-restore.sh <dump-file> <target-DATABASE_URL> [--yes-really]
# Refuses targets whose URL contains "prod" unless --yes-really is given.
# The target database must already exist. Never prints the URL.
set -euo pipefail

FILE="${1:-}"; TARGET="${2:-}"; FORCE="${3:-}"
[ -n "$FILE" ] && [ -n "$TARGET" ] || { echo "usage: $0 <dump-file> <target-DATABASE_URL> [--yes-really]" >&2; exit 2; }
[ -f "$FILE" ] || { echo "dump file not found: $FILE" >&2; exit 2; }
command -v pg_restore >/dev/null || { echo "pg_restore not found (install postgresql-client)" >&2; exit 2; }

if printf '%s' "$TARGET" | grep -qi 'prod' && [ "$FORCE" != "--yes-really" ]; then
  echo "refusing: target looks like production. Re-run with --yes-really if you are sure." >&2
  exit 3
fi

# Drop only Prisma's ?schema= parameter (libpq rejects it); keep the rest
# (sslmode=require and friends are needed by hosted PostgreSQL).
libpq_url() {
  local url="$1" base query
  base="${url%%\?*}"
  [ "$url" = "$base" ] && { printf '%s' "$url"; return; }
  query="$(printf '%s' "${url#*\?}" | tr '&' '\n' | grep -v '^schema=' | paste -sd'&' - || true)"
  printf '%s%s' "$base" "${query:+?$query}"
}
RESTORE_URL="$(libpq_url "$TARGET")"
pg_restore --clean --if-exists --no-owner --exit-on-error --dbname="$RESTORE_URL" "$FILE" 2>/dev/null \
  || { echo "pg_restore failed (does the target database exist? are credentials correct?)" >&2; exit 1; }
echo "restore ok: $FILE"
