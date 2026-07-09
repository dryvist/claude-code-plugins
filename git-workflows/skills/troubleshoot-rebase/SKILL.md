---
name: troubleshoot-rebase
description: Diagnose and recover from git rebase failures
---

# Git Rebase Troubleshoot

Diagnose and recover from rebase failures. Invoke when standard rebase error handling cannot resolve the issue.

## Quick Diagnosis

Check: `pwd`, `git status`, `git branch --show-current`, `git worktree list`, `gh pr view`.

Resolve the repo's default branch before any rebase — it is the correct rebase
target, not necessarily `main`:

```bash
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')
```

`main` on a git-flow repo (default branch `develop`, see /gh-cli-patterns
Canonical Default-Branch Detection in github-workflows) is never a rebase
target — it takes merge commits only. Feature branches there rebase onto
`develop`, and only a `hotfix/*` branch legitimately rebases onto `main`.

## Error: Push Rejected (Non-Fast-Forward)

Branches have diverged. First, confirm your current branch: `git branch --show-current`.

- If this is a **feature branch** (for example `feature/foo`) and the push was rejected:
  - Rebase onto the latest default branch: `git fetch origin --force && git rebase origin/<DEFAULT_BRANCH>`
  - Then push your feature branch: `git push --force-with-lease origin HEAD`

- If you are on `<DEFAULT_BRANCH>` and are behind `origin/<DEFAULT_BRANCH>`, do
  **not** rebase it:
  - Update it: `git fetch origin --force && git reset --hard origin/<DEFAULT_BRANCH>`
  - Then retry your original operation (for example, rebase your feature branch onto `<DEFAULT_BRANCH>` and push the feature branch).

If the rebase fails because `origin/<DEFAULT_BRANCH>` moved again, repeat: fetch, rebase your feature branch, then push with `--force-with-lease`.

## Error: Repository Rule Violations

GH013 error about PR/status checks. This is NOT a block if commits are from approved PR.

**Causes**: CI not passing, reviews not approved, merge conflict.

**Fix order**: Rebase feature -> push (triggers CI) -> wait for checks -> merge to `<DEFAULT_BRANCH>` -> push.

Check: `gh pr view <branch> --json checks,reviews,statusCheckRollup`

## Error: Embedded Git Repository

Nested .git directory found. Fix: `git rm --cached <folder-name>` or add to `.gitignore`.

## Rebase Conflict

Identify: `git status`, `git diff --name-only --diff-filter=U`

Resolve: edit files, `git add <file>`, then `git rebase --continue` (or `--abort`).

## Error: Fast-Forward Merge Failed

The default branch was updated between rebase and merge. Run
`git fetch origin --force && git reset --hard origin/<DEFAULT_BRANCH>`, then retry.

## Error: Feature Branch Push Failed

Fix: `git push --force-with-lease origin <branch>`

## Recovery: Aborting In-Progress Rebase

`git rebase --abort && git status`

## Verification

Before retrying:

- Default branch synced: `git diff origin/<DEFAULT_BRANCH> --stat` (should be empty)
- Branch clean: `git status`
- No rebase in progress: check `.git/rebase-{merge,apply}` doesn't exist
- PR state: `gh pr view <branch> --json state`

## Escalation

If unresolved: check `git reflog`, review `git log -10 --oneline`, ask user.

**DO NOT**: Use `--force` (use `--force-with-lease`), use `gh pr merge`, run `git rebase -i`.

## Related Skills

- **rebase-pr** (github-workflows) — Standard rebase-merge PR workflow this skill troubleshoots
- **troubleshoot-precommit** (git-workflows) — Troubleshoot pre-commit hook failures during rebase
- **troubleshoot-worktree** (git-workflows) — Troubleshoot git worktree, branch, and refname issues
