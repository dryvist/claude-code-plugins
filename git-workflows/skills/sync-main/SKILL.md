---
name: sync-main
description: Update main from remote and merge into current or all PR branches
---

# Sync Main

Update the local `main` branch from remote and merge it into the current working branch,
or all open PR branches when using the `all` parameter.

## Scope Parameter

| Usage | Scope |
| ----- | ----- |
| `/sync-main` | Current branch only |
| `/sync-main all` | All open PR branches |

**CURRENT REPOSITORY ONLY** - This command never crosses into other repositories.

## Prerequisites

- You must be in a feature branch worktree (not on main itself)
- The current branch should have no uncommitted changes

## Single Branch Mode (Default)

1. **Verify state**: `git branch --show-current`, `git status --porcelain`
   - STOP if on main or uncommitted changes
2. **Find and sync main**: `cd ${GIT_HOME_PUBLIC}/<repo>/main && git fetch --all --prune --force && git pull`
3. **Check for updates**: `git fetch origin --force main`
4. **Report**: Show commits behind with `git log --oneline HEAD..origin/main` (informational only)
5. **Merge**: `git merge origin/main --no-edit`
   - If already up-to-date: skip to step 7 and report
   - If merge succeeds cleanly: continue to step 6
   - If conflicts occur: **STOP, do not push**. Report conflict status and follow the **Conflict Resolution** section below
6. **Push (only if merge succeeded cleanly)**: `git push origin $(git branch --show-current)`
7. **Report**: branch, main SHA, merge status

## All Branches Mode (Orchestrator)

Report sync status for all open PR branches.

### Steps

1. **Get repo**: `gh repo view --json nameWithOwner`
2. **Update main**: CRITICAL - must happen first
3. **List open PRs**: `gh pr list --state open --json number,headRefName,title`
4. **Check each PR**: Launch subagents in parallel (invoke `superpowers:dispatching-parallel-agents`). Each checks if behind main. Do NOT merge or push.
5. **Report**: repo, main SHA, merge-readiness for each PR (current/behind/conflict)
6. **Sync conflict-free branches**: For each branch classified as `behind` (not `conflict`) in step 5,
   merge `origin/main` using `git merge origin/main --no-edit`. Branches already classified as `conflict`
   in step 5 are skipped entirely — no merge is attempted on them, so no `git merge --abort` is needed.
   No confirmation required.
7. **Report conflicting branches**: Branches skipped due to pre-identified conflicts are reported for manual resolution

## Conflict Resolution

Read files, understand both versions, combine intelligently, stage resolved files, commit.

## DO NOT

- Blindly use `--theirs` or `--ours`
- Force push unless explicitly asked
- Skip reading conflicted files

## Related Skills

- **refresh-repo** (github-workflows) — Full repo sync including PR status and worktree cleanup
- **rebase-pr** (github-workflows) — Rebase-merge workflow that builds on a synced main
- **git-workflow-standards** (git-standards) — Branch hygiene and sync conventions
