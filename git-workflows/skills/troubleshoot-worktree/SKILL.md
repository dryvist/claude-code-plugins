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

**Never assume paths** - always discover with `git worktree list`. The first
column is the path; the bracketed name is the branch checked out there.

## Critical: Ambiguous Refname

**Warning**: `warning: refname 'origin/main' is ambiguous`

Means TWO things named `origin/main`:

- `refs/heads/origin/main` - LOCAL branch (bad)
- `refs/remotes/origin/main` - remote tracking (good)

**Diagnose**: `git show-ref origin/main`

**Fix**: `git branch -D origin/main` then verify only 1 line remains with `git show-ref origin/main`.

## Common Errors

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

## Related Skills

- **troubleshoot-rebase** (git-workflows) — Diagnose and recover from git rebase failures
- **troubleshoot-precommit** (git-workflows) — Troubleshoot pre-commit hook failures
- **refresh-repo** (github-workflows) — Full repo sync including worktree cleanup
