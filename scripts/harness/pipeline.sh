#!/usr/bin/env bash
# Run several exec-plans in sequence on one repo: implement -> gate -> review -> commit.
#   scripts/harness/pipeline.sh <repo> <impl-engine>:<review-engine>:<plan.md> [...]
# Each plan gets its own commit so the next reviewer only sees its own diff.
# The planner still reads every review afterwards and applies fixes.
set -uo pipefail
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
REPO="$(cd "$1" && pwd)"; shift
for spec in "$@"; do
  IFS=: read -r IMPL REV PLAN <<<"$spec"
  NAME="$(basename "$PLAN" .md)"
  echo "=== $NAME: implement with $IMPL"
  bash "$HERE/scripts/harness/delegate.sh" "$IMPL" implementer "$PLAN" "$REPO" | tail -15
  echo "=== $NAME: gate"
  if ! (cd "$REPO" && bash scripts/gate.sh | tail -9); then
    echo "=== $NAME: GATE FAILED, stopping pipeline"; exit 1
  fi
  echo "=== $NAME: review with $REV"
  bash "$HERE/scripts/harness/delegate.sh" "$REV" reviewer "$PLAN" "$REPO" | tail -40
  (cd "$REPO" && git add -A && git commit -qm "feat: $NAME (harness: $IMPL, reviewed by $REV)" && echo "=== $NAME: committed $(git rev-parse --short HEAD)")
done
echo "=== pipeline done"
