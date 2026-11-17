#!/usr/bin/env bash
# Logical backup of the PostgreSQL pointed to by DATABASE_URL (custom format).
#   DATABASE_URL=... scripts/db-backup.sh
# BACKUP_DIR  destination folder (default: backups/)
# BACKUP_KEEP how many dumps to keep (default: 14)
# Never prints DATABASE_URL (it contains the password).
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
case "$BACKUP_KEEP" in ''|*[!0-9]*) echo "BACKUP_KEEP must be a positive integer" >&2; exit 2;; esac
[ "$BACKUP_KEEP" -ge 1 ] || { echo "BACKUP_KEEP must be >= 1" >&2; exit 2; }

command -v pg_dump >/dev/null || { echo "pg_dump not found (install postgresql-client)" >&2; exit 2; }

# Drop only Prisma's ?schema= parameter (libpq rejects it); keep the rest
# (sslmode=require and friends are needed by hosted PostgreSQL).
libpq_url() {
  local url="$1" base query
  base="${url%%\?*}"
  [ "$url" = "$base" ] && { printf '%s' "$url"; return; }
  query="$(printf '%s' "${url#*\?}" | tr '&' '\n' | grep -v '^schema=' | paste -sd'&' - || true)"
  printf '%s%s' "$base" "${query:+?$query}"
}
DUMP_URL="$(libpq_url "$DATABASE_URL")"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/$STAMP.dump"
TMP="$OUT.partial"
trap 'rm -f "$TMP"' EXIT

pg_dump --format=custom --no-owner --dbname="$DUMP_URL" --file="$TMP" 2>/dev/null \
  || { echo "pg_dump failed (check connectivity and credentials)" >&2; exit 1; }
mv "$TMP" "$OUT"
echo "backup ok: $OUT ($(wc -c <"$OUT") bytes)"

# Retention: keep the newest BACKUP_KEEP dumps (timestamps sort lexically).
# shellcheck disable=SC2012
ls -1 "$BACKUP_DIR"/*.dump 2>/dev/null | sort -r | tail -n +"$((BACKUP_KEEP + 1))" | while read -r old; do
  rm -f -- "$old"
  echo "removed old backup: $old"
done
