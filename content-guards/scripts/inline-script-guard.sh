#!/bin/bash
# inline-script-guard.sh - PreToolUse hook to prevent inline scripts in .nix and .yml files
#
# Detects complex inline shell logic in Nix files and GitHub Actions workflows,
# enforcing extraction to separate script files.
#
# Exit codes: 0=allow, 2=deny

set -euo pipefail

# Read JSON input from stdin (fail-open if jq fails)
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || exit 0
new_string=$(echo "$input" | jq -r '.tool_input.new_string // empty' 2>/dev/null) || exit 0

# If no file path or no new content, allow
if [[ -z "$file_path" ]] || [[ -z "$new_string" ]]; then
    exit 0
fi

# Extract file extension (lowercase, tr for macOS bash 3.x compatibility)
extension=$(echo "${file_path##*.}" | tr '[:upper:]' '[:lower:]')

# --- Check .nix files for inline shell scripts ---
if [[ "$extension" == "nix" ]]; then
    # Count lines containing tokens that mean nothing in Nix, so their presence
    # really does indicate shell.
    #
    # The previous pattern also counted `if`, `then`, `else`, `&&` and `||`.
    # Every one of those is core Nix syntax: Nix has `if c then a else b`, and
    # `&&`/`||` are its boolean operators. The repo's own
    # `assert cond || throw "..."` idiom — used throughout lib/checks/*.nix — is
    # pure Nix and was denied by this hook. A guard that blocks the language it
    # is guarding teaches people to route around it, which is worse than no
    # guard.
    #
    # Comments are stripped before counting, because the English word "else" in
    # a prose comment was on its own enough to deny an edit.
    #
    # What is left (`fi`, `done`, `esac`, and the loop/case heads) has no
    # meaning in Nix at all, so a file accumulating more than the threshold is
    # genuinely carrying shell.
    shell_keyword_count=$(echo "$new_string" \
        | sed 's/#.*$//' \
        | grep -cE '\b(fi|for|while|do|done|case|esac)\b' 2>/dev/null) || true

    if [[ "$shell_keyword_count" -gt 3 ]]; then
        jq -n --arg fp "$file_path" '{
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: ("BLOCKED: Inline script detected in Nix file \(.fp).\n\nExtract to scripts/ directory and reference via builtins.readFile or writeShellApplication.\n\nShell scripts must NEVER be inline in .nix files. Use separate files in scripts/ with proper extensions.")
            }
        }' >&2
        exit 2
    fi
fi

# --- Check .yml/.yaml files for complex inline bash ---
if [[ "$extension" == "yml" ]] || [[ "$extension" == "yaml" ]]; then
    # Check for multiline run blocks (run: | or run: >)
    # Uses [[:space:]] for BSD compatibility on macOS
    if echo "$new_string" | grep -qE 'run:[[:space:]]*[|>]'; then
        # Count run-block lines using indentation-aware awk (handles indented YAML steps)
        run_block_lines=$(printf '%s\n' "$new_string" | awk '
            /run:[[:space:]]*[|>]/ {
                match($0, /^[[:space:]]*/); base = RLENGTH; counting = 1; n = 0; next
            }
            counting {
                match($0, /^[[:space:]]*/);
                if (RLENGTH <= base && $0 !~ /^[[:space:]]*$/) { counting = 0 }
                else n++
            }
            END { print n+0 }
        ')

        if [[ "$run_block_lines" -gt 5 ]]; then
            jq -n --arg fp "$file_path" '{
                hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason: ("BLOCKED: Complex inline bash in workflow YAML \(.fp).\n\nExtract to .github/scripts/ or scripts/ and call from the workflow step.\n\nNever embed complex bash logic inline in GitHub Actions workflow YAML.")
                }
            }' >&2
            exit 2
        fi
    fi
fi

# All checks passed, allow operation
exit 0
