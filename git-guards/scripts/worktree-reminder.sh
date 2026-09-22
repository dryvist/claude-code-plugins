#!/bin/bash
# UserPromptSubmit hook - force worktree usage by warning when on the default branch.
# Fires once per session; if the current branch is main/master on the first prompt of
# the session, injects a systemMessage requiring a worktree before any edits. WHERE the
# worktree is created is the AI's choice (native --worktree, git worktree add, anywhere
# it likes); THAT one must exist before editing is not optional.
#
# UserPromptSubmit provides a JSON payload on stdin, including session_id, which we use
# as a once-per-session marker so the same warning doesn't repeat on every prompt.

stdin_json=$(cat)
session_id=$(printf '%s' "$stdin_json" | jq -r '.session_id // empty' 2>/dev/null)

if [[ -n "$session_id" ]]; then
    marker="${TMPDIR:-/tmp}/git-guards-worktree-reminder-${session_id}"
    if [[ -e "$marker" ]]; then
        echo '{}'
        exit 0
    fi
fi

# `git branch --show-current` prints the branch name, empty on detached HEAD (e.g. a
# tool-managed worktree), and exits non-zero outside a repo — all of which mean "don't warn".
current_branch=$(git branch --show-current 2>/dev/null)

if [[ "$current_branch" == "main" ]] || [[ "$current_branch" == "master" ]]; then
    [[ -n "$session_id" ]] && touch "$marker" 2>/dev/null
    cat <<'ENDJSON'
{
  "systemMessage": "WARNING: You are on the main branch. You MUST create or switch to a separate worktree on its own branch BEFORE making any changes — how and where you create it is up to you. Do not read-for-editing, edit, write, or create files for the task until you are in a non-main worktree. This applies to ALL work — code, docs, and config."
}
ENDJSON
else
    echo '{}'
fi
