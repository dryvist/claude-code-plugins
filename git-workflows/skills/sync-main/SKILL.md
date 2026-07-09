---
name: sync-main
description: >-
  Update the repo's default branch from remote and merge it into the current
  branch, or all open PR branches. Despite the name (kept for continuity),
  this syncs whatever the repo's default branch actually is — main on trunk
  repos, develop on git-flow repos — and on git-flow repos also
  fast-forwards local main from origin/main.
---

# Sync Main

Update the local default branch from remote and merge it into the current working branch,
or all open PR branches when using the `all` parameter.

The skill keeps the name `sync-main` for continuity, but it syncs the repo's
actual default branch, not a literal `main`. On a trunk repo that is the same
thing; on a git-flow repo the default branch is `develop`, and this skill
treats `develop` as the sync target throughout.

## Scope Parameter

| Usage | Scope |
| ----- | ----- |
| `/sync-main` | Current branch only |
| `/sync-main all` | All open PR branches |

**CURRENT REPOSITORY ONLY** - This command never crosses into other repositories.

## Prerequisites

- You must be in a feature branch worktree (not on the default branch itself)
- The current branch should have no uncommitted changes

## Resolve the Default Branch (Both Modes)

```bash
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')
```

See /gh-cli-patterns (github-workflows) Canonical Default-Branch Detection for
what `main` vs `develop` implies. Use `<DEFAULT_BRANCH>` everywhere below.

## Single Branch Mode (Default)

1. **Verify state**: `git branch --show-current`, `git status --porcelain`
   - STOP if on `<DEFAULT_BRANCH>` or uncommitted changes
2. **Sync default branch**: `git fetch --all --prune --force && git pull` (in the `<DEFAULT_BRANCH>` worktree)
3. **Check for updates**: `git fetch origin --force <DEFAULT_BRANCH>`
4. **Report**: Show commits behind with `git log --oneline HEAD..origin/<DEFAULT_BRANCH>` (informational only)
5. **Merge**: `git merge origin/<DEFAULT_BRANCH> --no-edit`
   - If already up-to-date: skip to step 7 and report
   - If merge succeeds cleanly: continue to step 6
   - If conflicts occur: **STOP, do not push**. Report conflict status and follow the **Conflict Resolution** section below
6. **Push (only if merge succeeded cleanly)**: `git push origin $(git branch --show-current)`
7. **Report**: branch, `<DEFAULT_BRANCH>` SHA, merge status

### Git-Flow Extra Step: Fast-Forward Local Main

If `<DEFAULT_BRANCH> == develop` (git-flow repo) and a local `main` worktree
exists, also fast-forward it from `origin/main` so it never goes silently
stale between promotions:

```bash
git -C <path-to-main-worktree> fetch origin main
git -C <path-to-main-worktree> merge --ff-only origin/main
```

Resolve `<path-to-main-worktree>` from `git worktree list --porcelain`,
matching the `branch refs/heads/main` entry. If no local `main` worktree
exists, skip this step — there is nothing to fast-forward. Never push here;
`main` on a git-flow repo only moves via `/promote-release` (github-workflows).

## All Branches Mode (Orchestrator)

Report sync status for all open PR branches.

### Steps

1. **Get repo**: `gh repo view --json nameWithOwner`
2. **Update default branch**: CRITICAL - must happen first (and its git-flow extra step above)
3. **List open PRs**: `gh pr list --state open --json number,headRefName,title`
4. **Check each PR**: Launch subagents in parallel (invoke `superpowers:dispatching-parallel-agents`).
   Each checks if behind `<DEFAULT_BRANCH>`. Do NOT merge or push.
5. **Report**: repo, `<DEFAULT_BRANCH>` SHA, merge-readiness for each PR (current/behind/conflict)
6. **Sync conflict-free branches**: For each branch classified as `behind` (not `conflict`) in step 5,
   merge `origin/<DEFAULT_BRANCH>` using `git merge origin/<DEFAULT_BRANCH> --no-edit`. Branches already classified as `conflict`
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
- **rebase-pr** (github-workflows) — Rebase-merge workflow that builds on a synced base branch
- **promote-release** (github-workflows) — Moves develop to main on git-flow repos; the fast-forward step here only reads main, never pushes it
- **gh-cli-patterns** (github-workflows) — Canonical default-branch detection (trunk vs git-flow)
- **git-workflow-standards** (git-standards) — Branch hygiene and sync conventions
