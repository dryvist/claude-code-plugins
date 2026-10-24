---
name: refresh-repo
description: Check PR readiness and fast-forward the local default branch.
---

<!-- cspell:words headRefOid -->

# Git Refresh

Check open PR merge-readiness and fast-forward the local default branch.
For branch creation and PR-branch sync, follow the [Git Town rule](https://github.com/dryvist/ai-llm-prompts/blob/main/auto-ai-agent/instructions/agentsmd/rules/on-demand/git-flow.md).

> **State warning**: Branch state, remote tracking, and PR status change between
> invocations. Re-run all git and gh commands before reporting.

## Steps

### 1. Identify open PRs

Always check for open PRs, regardless of the current branch.

```bash
gh pr view --json state,number,title 2>/dev/null
gh pr list --state open --limit 50 --json number,title,headRefName
```

### 2. Check merge readiness

For each open PR, run the [canonical PR-readiness gate](../gh-cli-patterns/SKILL.md#canonical-pr-readiness-gate).
It requires zero unaddressed items in the [PR feedback ledger](../gh-cli-patterns/references/pr-feedback-ledger.md)
and every required status context reported. Name an absent context as
`required check never reported: <context>` and see
[github-actions-silent-failures](../github-actions-silent-failures/SKILL.md).
Replace `<OWNER>`, `<REPO>`, and `<PR_NUMBER>` per the placeholder legend in
that skill.

A PR is ready only when all of these conditions pass:

| Field | Required |
|---|---|
| `state` | `OPEN` |
| `mergeable` | `MERGEABLE` |
| `mergeStateStatus` | `CLEAN` or `HAS_HOOKS` |
| `isDraft` | `false` |
| `reviewDecision` | `APPROVED` or `null` |
| `statusCheckRollup.state` | `SUCCESS` |
| PR feedback ledger | Zero unaddressed items |
| Required status-check contexts | Every context reported |
| `reviewThreads.isResolved` | `true` for every thread |
| `reviewThreads.pageInfo.hasNextPage` | `false` |

### 3. Fast-forward the local default branch

1. Fetch origin without updating tags: `git fetch origin --no-tags`.
2. Resolve the default branch from `origin/HEAD`; use
   [gh-cli-patterns](../gh-cli-patterns/SKILL.md) if it is not set.
3. Find the worktree checked out to the local default branch with
   `git worktree list --porcelain`.
4. If that worktree is clean, fast-forward it with
   `git -C <path> merge --ff-only origin/<default>`. If it is dirty, report
   that and skip it.
5. If the local default branch is not checked out in any worktree, run
   `git fetch origin <default>:<default>`. This creates the local branch if
   needed and refuses non-fast-forward updates.
6. If an update refuses, report
   `git rev-list --left-right --count <default>...origin/<default>` and skip.
   Do not force, reset, or rebase the local default branch.

## Report

Report each PR's readiness status and the local default branch as
fast-forwarded, already current, or skipped with its reason.

## Related Skills

- **gh-cli-patterns** (github-workflows) — PR-readiness gate and default-branch detection
