---
name: troubleshoot-worktree
description: Troubleshoot git worktree, branch, and refname issues
---

# Git Worktree Troubleshooting

Diagnose and fix worktree, branch, and reference issues.

## Quick Diagnostics

Always run first:

```bash
git worktree list
git branch -a
git status
pwd
```

## Worktree Discovery

**Never assume paths** - always discover:

```bash
git worktree list
# Main: line with [main] - first column is path
# Branch: line with [<branch>] - first column is path
```

## Critical: Ambiguous Refname

**Warning**: `warning: refname 'origin/main' is ambiguous`

Means TWO things named `origin/main`:

- `refs/heads/origin/main` - LOCAL branch (bad)
- `refs/remotes/origin/main` - remote tracking (good)

**Diagnose**: `git show-ref origin/main`

**Fix**: `git branch -D origin/main` then verify only 1 line remains with `git show-ref origin/main`.

## Common Errors

### Main Worktree Not Found

```bash
git worktree add main main
```

### Branch Worktree Not Found

```bash
git fetch origin --force <branch>
git worktree add ../<branch> <branch>
```

### Branch Not Found

```bash
git fetch origin --force
git branch -a | grep -i "<branch>"
```

### Uncommitted Changes

```bash
git add . && git commit -m "WIP"          # Commit
git stash push -m "before operation"      # Stash (temporary)
git checkout -- .                         # Discard (DESTRUCTIVE)
```

### Embedded Git Repository

```bash
git rm --cached <folder>
echo "<folder>/" >> .gitignore
```

## Recovery: Reset to Clean State

```bash
MAIN_PATH=$(git worktree list | grep '\[main\]' | awk '{print $1}')
BRANCH_PATH=$(git worktree list | grep '\[<branch>\]' | awk '{print $1}')

cd "$BRANCH_PATH" && git fetch origin --force && git reset --hard origin/<branch>
cd "$MAIN_PATH" && git fetch origin --force && git reset --hard origin/main
```

## Recovery: Fresh Worktree

```bash
git worktree remove "<path>" --force
git fetch origin --force
git worktree add "<new-path>" "<branch>"
```

## Related Skills

- **troubleshoot-rebase** (git-workflows) — Diagnose and recover from git rebase failures
- **troubleshoot-precommit** (git-workflows) — Troubleshoot pre-commit hook failures
- **refresh-repo** (github-workflows) — Full repo sync including worktree cleanup
