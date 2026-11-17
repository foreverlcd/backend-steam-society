#!/usr/bin/env bash
# One command = every quality check. Agents MUST run it before declaring a task
# done (docs/HARNESS.md). Output stays short: only failing steps print a log tail.
#   scripts/gate.sh          quick: boundaries, lint, build, unit tests, secret scan
#   scripts/gate.sh full     quick + e2e (needs Postgres on 127.0.0.1:5433)
set -uo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-quick}"
LOG_DIR="$(mktemp -d)"
FAILED=0

step() {
  local name="$1"; shift
  local log="$LOG_DIR/$name.log"
  local start=$SECONDS
  if "$@" >"$log" 2>&1; then
    printf '  ok    %-12s %3ss\n' "$name" $((SECONDS - start))
  else
    printf '  FAIL  %-12s %3ss\n' "$name" $((SECONDS - start))
    echo "----- $name (last 40 lines) -----"; tail -n 40 "$log"; echo "-----"
    FAILED=1
  fi
}

secret_scan() {
  local base; base="$(git merge-base HEAD origin/main 2>/dev/null || echo HEAD)"
  local hits
  hits="$( { git diff "$base"; git diff HEAD; } | grep -E '^\+' \
    | grep -inE "(password|secret|token|api[_-]?key)[\"']?\s*[:=]\s*[\"'][^\"'\$<{]{8,}|BEGIN [A-Z ]*PRIVATE KEY|postgres(ql)?://[^:@/]+:[^@/]+@" \
    | grep -vE "example|placeholder|una-contraseña|changeme|test-only" || true)"
  if git ls-files --error-unmatch .env >/dev/null 2>&1; then echo ".env is tracked by git"; return 1; fi
  [ -z "$hits" ] || { echo "$hits"; return 1; }
}

echo "gate ($MODE) backend"
step boundaries node scripts/check-boundaries.mjs
step lint       pnpm -s exec oxlint --type-aware src/ test/
step build      pnpm -s build
step unit       pnpm -s test
step secrets    secret_scan
if [ "$MODE" = "full" ]; then
  if node -e "require('net').connect(5433,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"; then
    step e2e pnpm -s test:e2e
  else
    echo "  FAIL  e2e          Postgres not reachable on 127.0.0.1:5433 (docker compose up -d postgres)"; FAILED=1
  fi
fi
rm -rf "$LOG_DIR"
[ "$FAILED" = 0 ] && echo "GATE PASSED" || { echo "GATE FAILED"; exit 1; }
