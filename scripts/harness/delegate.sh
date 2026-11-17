#!/usr/bin/env bash
# Delegate one well-specified task to a cheaper agent (docs/HARNESS.md).
#
#   scripts/harness/delegate.sh <engine> <role> <task.md> [repo-dir]
#
#   engine: sonnet | haiku | codex | agy | opencode
#   role:   implementer | reviewer | doc-gardener   (docs/harness/roles/<role>.md)
#   task:   a task file written from docs/exec-plans/TEMPLATE.md
#   repo:   where the agent works (default: this backend repo)
#
# Env: MODEL overrides the engine's model (e.g. MODEL=opencode/glm-5.3-flash-free).
# Output: <repo>/.harness/runs/<timestamp>-<engine>-<role>.md (gitignored).
#
# Reviewer and doc-gardener run READ-ONLY. Implementers may edit files but the
# role forbids git commits: the planner (you or Claude) reviews and integrates.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/../.." && pwd)"
ENGINE="${1:?engine}"; ROLE="${2:?role}"; TASK="${3:?task file}"
REPO="$(cd "${4:-$HERE}" && pwd)"
ROLE_FILE="$HERE/docs/harness/roles/$ROLE.md"
[ -f "$ROLE_FILE" ] || { echo "unknown role: $ROLE"; exit 2; }
[ -f "$TASK" ] || { echo "task file not found: $TASK"; exit 2; }

READONLY=1; [ "$ROLE" = "implementer" ] && READONLY=0
PROMPT="$(cat "$ROLE_FILE")

---
Repositorio de trabajo: $REPO
Reglas de arquitectura y principios: $HERE/docs/GOLDEN-PRINCIPLES.md

# Tarea
$(cat "$TASK")"

# Reviewers get the diff inside the prompt: headless engines (agy, opencode
# plan) cannot always ask permission to run git themselves.
if [ "$ROLE" = "reviewer" ]; then
  DIFF="$(cd "$REPO" && git diff HEAD; cd "$REPO" && git ls-files --others --exclude-standard | while read -r f; do git diff --no-index /dev/null "$f" || true; done)"
  PROMPT="$PROMPT

# Cambio a revisar (git diff HEAD + archivos nuevos)
El diff ya está aquí: NO ejecutes comandos de shell (en modo headless se rechazan). Si necesitas más contexto, solo lee archivos.
\`\`\`diff
${DIFF:0:150000}
\`\`\`"
fi

mkdir -p "$REPO/.harness/runs"
OUT="$REPO/.harness/runs/$(date +%Y%m%d-%H%M%S)-$ENGINE-$ROLE.md"
cd "$REPO"

case "$ENGINE" in
  sonnet|haiku)
    if [ "$READONLY" = 1 ]; then
      TOOLS=(--allowedTools "Read" "Grep" "Glob" "Bash(git diff:*)" "Bash(git status:*)" "Bash(git log:*)" "Bash(git show:*)" --disallowedTools "Edit" "Write")
    else
      TOOLS=(--permission-mode acceptEdits --allowedTools "Read" "Grep" "Glob" "Edit" "Write" "Bash(pnpm:*)" "Bash(bash scripts/gate.sh:*)" "Bash(scripts/gate.sh:*)" "Bash(node scripts/check-boundaries.mjs)" "Bash(grep:*)" "Bash(ls:*)" "Bash(git diff:*)" "Bash(git status:*)")
    fi
    # Prompt via stdin: --allowedTools is variadic and would swallow a positional prompt.
    printf '%s' "$PROMPT" | claude -p --model "${MODEL:-$ENGINE}" "${TOOLS[@]}" | tee "$OUT"
    ;;
  codex)
    SANDBOX=workspace-write; [ "$READONLY" = 1 ] && SANDBOX=read-only
    # gpt-6-luna works with the owner's ChatGPT account (free quota; it will run out).
    # Prompt via stdin ("-"): a reviewer prompt with a big diff exceeds the
    # argv limit, and with an open stdin codex waits for more input forever.
    printf '%s' "$PROMPT" | codex exec -m "${MODEL:-gpt-6-luna}" -s "$SANDBOX" -C "$REPO" -o "$OUT" -
    ;;
  agy)
    # Headless agy auto-denies anything not allowed in --settings. Read-only
    # roles get session-scoped read permissions; agy edits through shell
    # commands, so it is NOT used as implementer (would need a full shell).
    if [ "$READONLY" = 0 ]; then echo "agy is review-only in this harness (see docs/HARNESS.md)"; exit 2; fi
    # Rules need a target (read_file(<glob>)); a bare "read_file" is auto-denied.
    # Tested 2026-11-17: neither scoped allows nor "deny" rules keep it from
    # reading other files, so .env safety relies on the role prompt (as with codex).
    ALLOW=""
    for tool in read_file list_dir grep_search find_by_name; do ALLOW+="\"$tool($REPO/**)\","; done
    agy ${MODEL:+--model "$MODEL"} --mode plan \
      --settings "{\"permissions\":{\"allow\":[${ALLOW%,}]}}" \
      -p "$PROMPT" < /dev/null | tee "$OUT"
    ;;
  opencode)
    echo "NOTE: free opencode models send this repo's code to third-party providers. Never use them on tasks that touch secrets or personal data." >&2
    if [ "$READONLY" = 1 ]; then AGENT=(--agent plan); else AGENT=(--auto); fi
    opencode run -m "${MODEL:-opencode/deepseek-v4.1-flash-free}" "${AGENT[@]}" "$PROMPT" < /dev/null | tee "$OUT"
    ;;
  *) echo "unknown engine: $ENGINE"; exit 2 ;;
esac

if [ ! -s "$OUT" ]; then echo "delegate: $ENGINE produced no output (see errors above)" >&2; exit 1; fi
echo
echo "Saved: $OUT"
[ "$READONLY" = 0 ] && echo "Next: review with  scripts/harness/delegate.sh codex reviewer $TASK $REPO  and run scripts/gate.sh"
exit 0
