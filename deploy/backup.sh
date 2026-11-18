#!/usr/bin/env bash
# Daily backup on the production VM (run from root's crontab, see
# docs/DEPLOY-ORACLE.md). Steps:
#   1. scripts/db-backup.sh inside the compose `backup` tool container
#      (pg_dump 18, same network as postgres; keeps the newest BACKUP_KEEP).
#   2. Off-VM copy with rclone to BACKUP_RCLONE_REMOTE, if set.
# Never prints DATABASE_URL or other secrets.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-deploy/.env.prod}"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE" >&2; exit 2; }

# Only the two backup settings are read from the env file (no secrets).
read_var() { grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '"'"'" || true; }
BACKUP_HOST_DIR="$(read_var BACKUP_HOST_DIR)"; BACKUP_HOST_DIR="${BACKUP_HOST_DIR:-/var/backups/steam}"
BACKUP_RCLONE_REMOTE="$(read_var BACKUP_RCLONE_REMOTE)"

mkdir -p "$BACKUP_HOST_DIR"
chmod 700 "$BACKUP_HOST_DIR"

echo "[$(date -u +%FT%TZ)] backup start"
docker compose --env-file "$ENV_FILE" -f deploy/docker-compose.prod.yml run --rm -T backup

if [ -n "$BACKUP_RCLONE_REMOTE" ]; then
  command -v rclone >/dev/null || { echo "rclone not installed; off-VM copy skipped" >&2; exit 1; }
  # copy (not sync): deleting old dumps locally never deletes them remotely.
  rclone copy --no-traverse "$BACKUP_HOST_DIR" "$BACKUP_RCLONE_REMOTE" --include '*.dump'
  echo "off-VM copy ok: $BACKUP_RCLONE_REMOTE"
else
  echo "BACKUP_RCLONE_REMOTE empty: dump stays only on this VM (set it!)" >&2
fi
echo "[$(date -u +%FT%TZ)] backup done"
