# Phase 4: Update PR Metadata — mechanics

Reference detail for `finalize-pr`. Loaded on demand once Phase 3 passes.

Delegate to a **haiku subagent** to keep full diff out of main context.
Steps 4.1 and 4.2 run sequentially within the agent. Step 4.3 runs after both.

## 4.1 Update PR Title and Description

1. Summarize branch history and diff stats against the PR's base branch; read current PR title and body.
2. Generate updated title (conventional commit format, <70 chars) and description with sections:
   **Summary**, **Changes**, **Test Plan**.

## 4.2 Link Related Issues and PRs

1. Extract keywords from branch name and commit messages.
2. Search GitHub issues and PRs for related items (limit 5 each).
3. Add `Closes #X` (directly related issues) or `Related: #X` (adjacent PRs) — no guessing.
4. If the branch name, commits, or existing PR body already name a Zammad
   ticket (`#NNNNN`, `Zammad #NNNNN`, or a `$ZAMMAD_URL/#ticket/zoom/<id>`
   link), preserve it in the regenerated body as `Zammad: <full ticket URL>`.
   Do not search Zammad for new matches here — only carry forward a reference
   that already exists in this PR's own history.

## 4.3 Apply Updates

After 4.1 and 4.2 complete, apply title and body together — no temp files.
Use the heredoc body pattern from /gh-cli-patterns:

```bash
gh pr edit <PR_NUMBER> --title "generated title" --body "$(cat <<'EOF'
... generated body ...
EOF
)"
```

Single-quoted `'EOF'` prevents shell expansion. Closing `EOF` must be alone on its own line with no leading whitespace.

Proceed to Phase 5.
