---
description: Git worktree path and branch naming conventions for this project
---

# Worktree Conventions

When creating git worktrees, follow these project-specific conventions instead of
default `.worktrees/` placement.

## Path Convention

```text
${GIT_HOME_PUBLIC}/{repo-name}/{branch-name}/
```

Examples:

- `${GIT_HOME_PUBLIC}/claude-code-plugins/feat/add-readme-validation/`
- `${GIT_HOME_PUBLIC}/terraform-proxmox/fix/firewall-rules/`

## Branch Naming

- Format: `{type}/{description}` (e.g., `feat/add-dark-mode`, `fix/login-bug`)
- Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `ci`, `test`, `perf`
- Rules: lowercase, hyphens between words, alphanumeric + hyphens only

## Before Creating

1. Switch to main and sync: `cd ${GIT_HOME_PUBLIC}/{repo-name}/main && git switch main && git pull`
2. Clean stale worktrees — a worktree is stale when it has no open PR, no uncommitted changes, and either:
   - A merged PR whose `headRefOid` matches local `HEAD` (`gh pr list --state merged --head {branch} --json number,headRefOid,mergedAt`)
   - A deleted remote (`[gone]` in `git branch -vv`) with no commits ahead of default
   - `git worktree remove {path}` (never `--force`) + `git branch -d {branch}`
   - If `git branch -d` fails on a squash-merged branch, use `git branch -D` only when the merged PR `headRefOid` matched local `HEAD`
   - `git worktree prune` to clean up

## After Creating

- If `.docs/` exists at repo root, symlink it into the worktree
- Run `direnv allow` if the repo uses direnv

## Reference

Use `superpowers:using-git-worktrees` for worktree creation, guided by these conventions.
