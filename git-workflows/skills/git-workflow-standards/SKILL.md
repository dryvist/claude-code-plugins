---
name: git-workflow-standards
description: Use for branch hygiene, merge conflict resolution, and worktree cleanup.
---

# Git Workflow Standards

For branch creation and PR-branch sync, follow the [Git Town rule](https://github.com/dryvist/ai-llm-prompts/blob/main/auto-ai-agent/instructions/agentsmd/rules/on-demand/git-flow.md).

Every branch with commits MUST have an associated PR.
Orphaned branches must get a PR or be deleted.

**Stale branch** (worktree-paired, bare local, or remote-only — see
`prune-branches`, github-workflows, for the full procedure): a non-default
branch, checked out nowhere, unreferenced by any open PR (`--head` or
`--base`), with no uncommitted changes (when a worktree exists), and either
a merged PR whose `headRefOid` matches the branch tip, or zero commits ahead
of the default branch. Use `git worktree remove` (never `--force`) for
worktree-paired branches — Git blocks removal of dirty worktrees — and
`git push origin --delete` for a live remote ref, only after
`prune-branches`'s pre-push ancestry re-check.

## Branch Hygiene

- Use conventional-commit prefixes without emoji (see `pr-standards`).

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

- **refresh-repo** (github-workflows) — PR readiness and local default-branch fast-forward
- **prune-branches** (github-workflows) — Stale branch and worktree cleanup
- **pr-stacks** (github-workflows) — PR stack submission and merge tracking
- **gh-cli-patterns** (github-workflows) — Canonical default-branch detection (trunk vs git-flow)
- **pr-standards** (github-workflows) — PR creation guards, issue linking, and review standards
