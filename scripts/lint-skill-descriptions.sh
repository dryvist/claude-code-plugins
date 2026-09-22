#!/bin/bash
# Pre-commit/CI hook: enforce a byte budget on SKILL.md frontmatter `description:`.
#
# The description is loaded into every session's system prompt as part of the
# skills listing, so its size is a direct, always-on context cost.
#   - >1024 bytes: fail. That's well beyond what a one-line trigger needs.
#   - >250 chars: warn. Long descriptions are tolerated (some skills genuinely
#     need more trigger detail) but should be trimmed where possible.
#
# Usage: lint-skill-descriptions.sh [SKILL.md ...]  (defaults to every SKILL.md)
set -euo pipefail

fail=0

lint_one() {
  local f="$1" desc bytes chars
  desc=$(awk '/^description:/{sub(/^description: */,""); print; exit}' "$f")
  [[ -z "$desc" ]] && return 0
  bytes=$(printf '%s' "$desc" | wc -c | tr -d ' ')
  chars=${#desc}
  if (( bytes > 1024 )); then
    echo "FAIL: $f description is $bytes bytes (>1024 limit)"
    fail=1
  elif (( chars > 250 )); then
    echo "WARN: $f description is $chars chars (>250, consider trimming)"
  fi
}

if [[ $# -gt 0 ]]; then
  for f in "$@"; do
    [[ -f "$f" ]] && lint_one "$f"
  done
else
  while IFS= read -r f; do
    lint_one "$f"
  done < <(find . -path ./.worktrees -prune -o -name SKILL.md -print | sort)
fi

exit "$fail"
