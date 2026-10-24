---
name: troubleshoot-rebase
description: Diagnose and recover from git rebase failures
---

# Git Rebase Troubleshoot

Diagnose and recover from rebase failures. Invoke when standard rebase error handling cannot resolve the issue.

## Quick Diagnosis

Check: `pwd`, `git status`, `git branch --show-current`, `git worktree list`, `gh pr view`.

For PR-branch sync, follow the [Git Town rule](https://github.com/dryvist/ai-llm-prompts/blob/main/auto-ai-agent/instructions/agentsmd/rules/on-demand/git-flow.md).
Use `/refresh-repo` to fast-forward a local default branch.

## Error: Push Rejected (Non-Fast-Forward)

Branches have diverged. First, confirm your current branch: `git branch --show-current`.

- If this is a PR branch and the push was rejected, sync it using the rule above,
  then retry: `git push --force-with-lease origin HEAD`.

- If you are on the default branch and it is behind origin, run `/refresh-repo`
  to fast-forward it, then retry your operation.

If the rebase fails because its parent moved, follow the Git Town rule above.

## Error: Repository Rule Violations

GH013 error about PR/status checks. This is NOT a block if commits are from approved PR.

**Causes**: CI not passing, reviews not approved, merge conflict.

**Fix order**: Follow the Git Town rule above for PR-branch sync, wait for checks,
then continue through the canonical PR-readiness gate.

Check: `gh pr view <branch> --json checks,reviews,statusCheckRollup`

## Error: Embedded Git Repository

Nested .git directory found. Fix: `git rm --cached <folder-name>` or add to `.gitignore`.

## Rebase Conflict

Identify: `git status`, `git diff --name-only --diff-filter=U`

Resolve: edit files, `git add <file>`, then `git rebase --continue` (or `--abort`).

## Error: Fast-Forward Merge Failed

The default branch moved between operations. Run `/refresh-repo` to fast-forward
the local default branch, then retry.

## Error: Feature Branch Push Failed

Fix: `git push --force-with-lease origin <branch>`

## Recovery: Aborting In-Progress Rebase

`git rebase --abort && git status`

## Verification

Before retrying:

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
