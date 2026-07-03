#!/bin/bash
set -euo pipefail

# Fail open if jq is unavailable
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)

# Fast-path: check raw input for gh pr create before any JSON parsing.
# This avoids jq overhead on every non-matching Bash command.
if [[ ! "$input" =~ gh[[:space:]]+pr[[:space:]]+create ]]; then
  exit 0
fi

# Extract the command that was executed
command=$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0

# Verify the command field actually contains gh pr create
if [[ ! "$command" =~ gh[[:space:]]+pr[[:space:]]+create ]]; then
  exit 0
fi

# Extract the tool result (stdout from the command)
result=$(echo "$input" | jq -r '.tool_result // empty' 2>/dev/null) || exit 0

# Check if PR was successfully created and extract PR number in one step
if [[ ! "$result" =~ pull/([0-9]+) ]]; then
  exit 0
fi
pr_number="${BASH_REMATCH[1]}"

# Emit systemMessage directing finalization of the newly created PR.
# Note: this hook fires for ALL gh pr create calls, including those from /ship.
# /finalize-pr is idempotent, so a duplicate invocation from /ship is harmless.
# The directive is intentionally strong to ensure finalization happens when
# the model would otherwise return to the user without finalizing, but it does
# not prevent a higher-level orchestrator (e.g., /ship) from continuing its workflow.
cat <<EOF
{
  "systemMessage": "POST-PR AUTOMATION: PR #${pr_number} was just created. If no higher-level workflow (such as /ship) is already handling finalization, you MUST invoke /finalize-pr ${pr_number} before returning to the user."
}
EOF
