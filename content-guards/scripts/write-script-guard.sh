#!/bin/bash
# write-script-guard.sh - PreToolUse hook to prevent unnecessary script file creation
#
# Two-stage guard:
#   Stage 1 (instant): Skip non-script files by extension/shebang
#   Stage 2 (for suspected scripts): Allow known directories, existing files,
#     then consult local MLX model for nuanced evaluation
#
# Exit codes: 0=allow, 2=deny

set -euo pipefail

# Read JSON input from stdin (fail-open if jq fails)
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || exit 0
content=$(echo "$input" | jq -r '.tool_input.content // empty' 2>/dev/null) || exit 0

# If no file path, allow (fail-open)
if [[ -z "$file_path" ]]; then
    exit 0
fi

# --- Stage 1: Fast pattern check ---

# Extract file extension (lowercase, tr for macOS bash 3.x compatibility)
extension=$(echo "${file_path##*.}" | tr '[:upper:]' '[:lower:]')

# If NOT a script extension AND no shebang, allow immediately (most files exit here)
case "$extension" in
    sh|py|rb|pl|js|bash|zsh|fish) ;;  # fall through to stage 2
    *) [[ "$content" == "#!"* ]] || exit 0 ;;
esac

# --- Stage 2: Evaluate suspected scripts ---

# Allow files in known script directories
case "$file_path" in
    */scripts/*|*/hooks/*|*/.github/*|*/tests/*|*/test/*|*/plugins/*|*/.claude/plugins/*) exit 0 ;;
esac

# Expand ~ to $HOME for path normalization (Claude Code may pass ~ paths)
file_path="${file_path/#\~/$HOME}"

# Check if file already exists (editing existing scripts is fine)
if [[ -f "$file_path" ]]; then
    exit 0
fi

# Consult local MLX model for nuanced evaluation
# Fail-open: if curl fails or model is unreachable, allow
response=$(curl -s --max-time 5 http://localhost:11434/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
        --arg fp "$file_path" \
        '{
            model: "mlx-community/Qwen3.5-27B-4bit",
            messages: [{
                role: "user",
                content: ("You are a script-prevention guardrail. A file is being created at: " + $fp + "\n\nIs this a legitimate committed artifact (CI workflow, plugin hook, test fixture, build tool) or an unnecessary custom script?\n\nRespond with ONLY '\''allow'\'' or '\''deny'\'' followed by a brief reason.")
            }],
            max_tokens: 100,
            temperature: 0
        }')" 2>/dev/null) || { exit 0; }

# Parse response (fail-open on parse errors)
decision=$(echo "$response" | jq -r '.choices[0].message.content // empty' 2>/dev/null) || { exit 0; }

# Check if response starts with "deny" (case-insensitive)
if echo "$decision" | head -1 | grep -qi '^deny'; then
    reason=$(echo "$decision" | sed 's/^[Dd]eny[[:space:]]*//')
    jq -n --arg fp "$file_path" --arg reason "$reason" '{
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: ("BLOCKED: Script creation at \(.fp) was denied.\n\nReason: \(.reason)\n\nUse existing tools, CLIs, or native patterns instead of creating new scripts. If this script is a legitimate committed artifact, place it in scripts/, hooks/, .github/, or tests/ directories.")
        }
    }' >&2
    exit 2
fi

# Allow by default (model said allow, or response could not be parsed)
exit 0
