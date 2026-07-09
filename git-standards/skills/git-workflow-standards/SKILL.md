---
name: git-workflow-standards
description: >-
  Use when managing branches, resolving merge conflicts, syncing with the
  default branch, or working with worktrees. Covers both trunk repos (main)
  and git-flow repos (develop) — see gh-cli-patterns (github-workflows) for
  default-branch detection.
---

# Git Workflow Standards

## Worktree Structure

All development uses dedicated worktrees. Never work directly on the default
branch — `main` on a trunk repo, `develop` on a git-flow repo.
Create a worktree for the change; remove it when the work is done.

Every branch with commits MUST have an associated PR.
Orphaned branches must get a PR or be deleted.

**Stale worktree**: A branch with no open PR, no uncommitted changes, and either a merged PR
whose `headRefOid` matches local `HEAD`, or a deleted remote (`[gone]`) with no commits ahead
of the default branch (`git log origin/<default>..HEAD --oneline` is empty). Branches with open
PRs, local-only branches without merged PRs, local commits beyond the merged PR head, and
worktrees with uncommitted changes are NEVER stale. Use `git worktree remove` (never `--force`)
— Git natively blocks removal of dirty worktrees.

## Branch Hygiene

- Sync the default branch daily: `git pull`
- Long-running branches: rebase from the default branch weekly
- Before PRs: ensure branch is on the latest default branch
- Never branch from feature branches — always from the default branch fresh
  (git-flow repos: `git flow feature start` branches from `develop`)
- Commit messages: conventional-commit prefixes only, no emoji (see `pr-standards`)

| Method | When |
| --- | --- |
| `git merge origin/<default>` | Default — preserves history, safer |
| `git rebase origin/<default>` | Only if branch has NOT been pushed yet |

Sync workflow (replace `<default>` with the repo's actual default branch — see
`gh-cli-patterns`, github-workflows):

```bash
git fetch origin <default> && git pull origin <default>   # in the <default> worktree
git merge origin/<default> --no-edit                       # in the feature worktree
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

- **sync-main** (git-workflows) — Syncs the repo's default branch and merges into current or all PR branches
- **refresh-repo** (github-workflows) — Full repo sync including PR status and worktree cleanup
- **gh-cli-patterns** (github-workflows) — Canonical default-branch detection (trunk vs git-flow)
- **pr-standards** (git-standards) — PR creation guards, issue linking, and review standards
