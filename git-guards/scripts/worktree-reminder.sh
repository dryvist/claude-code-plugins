#!/bin/bash
# UserPromptSubmit hook - force worktree usage by warning when on the default branch.
# Fires on every prompt submission; if the current branch is main/master, injects a
# systemMessage requiring a worktree before any edits. WHERE the worktree is created is
# the AI's choice (native --worktree, git worktree add, anywhere it likes); THAT one must
# exist before editing is not optional.
#
# Note: UserPromptSubmit provides user_prompt on stdin but we don't need it.

# `git branch --show-current` prints the branch name, empty on detached HEAD (e.g. a
# tool-managed worktree), and exits non-zero outside a repo — all of which mean "don't warn".
current_branch=$(git branch --show-current 2>/dev/null)

if [[ "$current_branch" == "main" ]] || [[ "$current_branch" == "master" ]]; then
    cat <<'ENDJSON'
{
  "systemMessage": "WARNING: You are on the main branch. You MUST create or switch to a separate worktree on its own branch BEFORE making any changes — how and where you create it is up to you. Do not read-for-editing, edit, write, or create files for the task until you are in a non-main worktree. This applies to ALL work — code, docs, and config."
}
ENDJSON
else
    echo '{}'
fi
