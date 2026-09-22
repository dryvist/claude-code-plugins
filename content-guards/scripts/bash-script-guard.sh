#!/bin/bash
# bash-script-guard.sh - PreToolUse hook to prevent script creation via Bash tool
#
# Detects patterns where Bash is used to write script files (redirects, heredocs)
# and blocks them, directing to the Write tool instead.
#
# Exit codes: 0=allow, 2=deny

set -euo pipefail

# Read JSON input from stdin (fail-open if jq fails)
input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0

# If no command, allow
if [[ -z "$command" ]]; then
    exit 0
fi

# Shared deny helper to reduce duplication
deny() {
    jq -n --arg reason "$1" '{
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: $reason
        }
    }' >&2
    exit 2
}

# All regexes use [[:space:]] and [^[:space:]] for BSD grep/sed compatibility on macOS
# (\s and \S are GNU extensions not supported by BSD tools)

# Check for file-writing patterns to script files (e.g., echo > file.sh, cat >> script.py)
if echo "$command" | grep -qE '\b(cat|tee|echo|printf)\b[^|;&]*>>?[[:space:]]+[^[:space:]]+\.(sh|py|rb|pl|js|bash)\b'; then
    deny "BLOCKED: Use the Write tool for file creation, not Bash redirects.\n\nThe Write tool provides proper file creation with atomic writes. Bash redirects to script files are not allowed."
fi

# Check for heredoc patterns writing to script files (e.g., cat > file.sh <<EOF)
if echo "$command" | grep -qE '(cat[[:space:]]+>>?[[:space:]]+[^[:space:]]+\.(sh|py|rb|pl|js|bash)[[:space:]]*<<|tee[[:space:]]+[^[:space:]]+\.(sh|py|rb|pl|js|bash)[[:space:]]*<<)'; then
    deny "BLOCKED: Use the Write tool for file creation, not heredocs.\n\nThe Write tool provides proper file creation with atomic writes. Heredoc-based file creation via Bash is not allowed."
fi

# Check for chmod +x on non-existent files (likely creating a new script outside allowed dirs)
if echo "$command" | grep -qE 'chmod[[:space:]]+\+x[[:space:]]+'; then
    target_file=$(echo "$command" \
        | grep -oE 'chmod[[:space:]]+\+x[[:space:]]+[^[:space:]]+' \
        | head -1 \
        | sed 's/chmod[[:space:]]*+x[[:space:]]*//')
    if [[ -n "$target_file" ]] && [[ ! -f "$target_file" ]]; then
        deny "BLOCKED: Scripts must be placed in scripts/ directory.\n\nUse the Write tool to create scripts in the appropriate directory (scripts/, hooks/, .github/, or tests/)."
    fi
fi

# All checks passed, allow operation
exit 0
