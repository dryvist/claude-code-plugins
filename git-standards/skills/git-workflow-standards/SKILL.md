---
name: git-workflow-standards
description: Use when managing branches, resolving merge conflicts, syncing with main, or working with worktrees
---

# Git Workflow Standards

## Worktree Structure

All development MUST use dedicated worktrees. Never work directly on main.

```text
${GIT_HOME_PUBLIC}/<repo>/
├── .git/                    # Shared bare repo
├── main/                    # Main branch (read-only for dev)
├── feature/<branch-name>/   # Feature worktrees
├── bugfix/<branch-name>/    # Bugfix worktrees
├── hotfix/<branch-name>/    # Hotfix worktrees
├── release/<branch-name>/   # Release worktrees
└── chore/<branch-name>/     # Chore worktrees
```

| Branch Type | Branch Name | Worktree Path |
| --- | --- | --- |
| Main | `main` | `${GIT_HOME_PUBLIC}/<repo>/main/` |
| Feature | `feature/add-feature` | `${GIT_HOME_PUBLIC}/<repo>/feature/add-feature/` |
| Bugfix | `bugfix/bug-name` | `${GIT_HOME_PUBLIC}/<repo>/bugfix/bug-name/` |
| Hotfix | `hotfix/critical-issue` | `${GIT_HOME_PUBLIC}/<repo>/hotfix/critical-issue/` |
| Release | `release/1.2.0` | `${GIT_HOME_PUBLIC}/<repo>/release/1.2.0/` |
| Chore | `chore/dependency-updates` | `${GIT_HOME_PUBLIC}/<repo>/chore/dependency-updates/` |

Create: `git worktree add -b <branch> ${GIT_HOME_PUBLIC}/<repo>/<branch> main`
Remove: `git worktree remove ${GIT_HOME_PUBLIC}/<repo>/<branch>`

Every branch with commits MUST have an associated PR.
Orphaned branches must get a PR or be deleted.

**Stale worktree**: A branch with no open PR, no uncommitted changes, and either a merged PR
whose `headRefOid` matches local `HEAD`, or a deleted remote (`[gone]`) with no commits ahead
of the default branch (`git log origin/<default>..HEAD --oneline` is empty). Branches with open
PRs, local-only branches without merged PRs, local commits beyond the merged PR head, and
worktrees with uncommitted changes are NEVER stale. Use `git worktree remove` (never `--force`)
— Git natively blocks removal of dirty worktrees.

## Branch Hygiene

- Sync main daily: `cd ${GIT_HOME_PUBLIC}/<repo>/main && git pull`
- Long-running branches: rebase from main weekly
- Before PRs: ensure branch is on latest main
- Never branch from feature branches — always from main
- Commit messages: conventional-commit prefixes only, no emoji (see `pr-standards`)

| Method | When |
| --- | --- |
| `git merge origin/main` | Default — preserves history, safer |
| `git rebase origin/main` | Only if branch has NOT been pushed yet |

Sync main workflow:

```bash
cd ${GIT_HOME_PUBLIC}/<repo>/main && git fetch origin main && git pull origin main
cd ${GIT_HOME_PUBLIC}/<repo>/feature/<branch> && git merge origin/main --no-edit
```

## Merge Conflict Resolution

**NEVER assume newer is correct.** Analyze both versions.

1. **Understand** — read full file, check `git log --oneline -10 -- <file>`
2. **Analyze** — identify what each side changed and why, check compatibility
3. **Resolve** — use the resolution table below
4. **Verify** — run `pre-commit run --files <file>`, read resolved file

| Scenario | Resolution |
| --- | --- |
| Additive changes | Keep both |
| Same logic modified | Combine intent of both |
| One is a bug fix | Always include the fix |
| One is a refactor | Apply refactor, then add other change |
| Truly incompatible | Prefer branch's changes, add comment |

Escalate to human review for complex business logic, fundamental
contradictions, or security-sensitive code.

| Command | Purpose |
| --- | --- |
| `git diff --name-only --diff-filter=U` | List conflicted files |
| `git log --merge -p <file>` | Show commits causing conflict |
| `git show :1:<file>` | Common ancestor version |
| `git show :2:<file>` | HEAD (your branch) version |
| `git show :3:<file>` | Incoming (their branch) version |
| `git merge --abort` | Abort and return to pre-merge state |

## Related Skills

- **sync-main** (git-workflows) — Syncs main and merges into current or all PR branches
- **refresh-repo** (git-workflows) — Full repo sync including PR status and worktree cleanup
- **pr-standards** (git-standards) — PR creation guards, issue linking, and review standards
