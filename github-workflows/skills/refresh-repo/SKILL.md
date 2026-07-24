---
name: refresh-repo
description: Check PR merge readiness and sync the local repo with its default branch. See prune-branches (github-workflows) for stale branch and worktree cleanup.
---

<!-- cspell:words refspec oneline headRefOid mergedAt -->

# Git Refresh

Check open PR merge-readiness status and sync the local repository with its
default branch.

> **State warning**: Branch state, remote tracking, and PR status change between
> invocations. Re-run all git/gh commands from Step 1.

## Steps

### 1. Identify Open PRs

**CRITICAL**: Always check for open PRs, regardless of current branch.

```bash
# Check for PR from current branch
gh pr view --json state,number,title 2>/dev/null

# ALWAYS also check for any open PRs by the user
gh pr list --author @me --state open --json number,title,headRefName
```

### 2. Report Merge-Readiness Status

For each open PR, check and report.

Run the **canonical PR-readiness gate** from /gh-cli-patterns.
Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>` per the placeholder legend in that skill.

**Merge-ready criteria** — all of the following must hold:

| Field | Required | Status |
|---|---|---|
| `state` | `OPEN` | Not ready |
| `mergeable` | `MERGEABLE` | Not ready |
| `mergeStateStatus` | `CLEAN` or `HAS_HOOKS` | Not ready (`BEHIND`, `BLOCKED`, `DIRTY`, `UNSTABLE`, `UNKNOWN`, `DRAFT`) |
| `isDraft` | `false` | Not ready |
| `reviewDecision` | `APPROVED` or `null` | Not ready |
| `statusCheckRollup.state` | `SUCCESS` | Not ready |
| All `reviewThreads.isResolved` | `true` | Not ready — unresolved threads |
| `reviewThreads.pageInfo.hasNextPage` | `false` | Not ready — >100 threads, paginate |

### 3. Sync Workflow

1. Record the current branch and worktree path.
2. Fetch origin with stale remote branch pruning, but without tag updates:
   `git fetch origin --no-tags --prune --force`
3. Determine the default branch from `origin/HEAD`, falling back to `main` or `master`.
4. **Restore the default-branch worktree to the default branch.** If a
   worktree is checked out to the default branch, keep it on the default
   branch. After a feature PR merges, that worktree is sometimes left on the
   now-`[gone]` feature branch. Detect and fix:
   - Resolve the default worktree path from `git worktree list --porcelain`,
     matching on the `branch refs/heads/<default>` entry — do not rely on
     basename matching of paths, since a feature branch named
     `feature/<default>` would also produce a path basename of `<default>`.
   - If that path exists and `git -C <path> rev-parse --abbrev-ref HEAD` does not equal
     `<default>` (this is safer than `symbolic-ref --short HEAD`, which errors on
     detached HEAD during a rebase or commit-checkout):
     - If the worktree has uncommitted changes
       (`git -C <path> status --porcelain` is non-empty), stash them first with
       `git -C <path> stash push -u -m "refresh-repo: auto-stash before <default> restore"`
       and surface the stash reference in the summary so the user can recover.
     - `git -C <path> checkout <default>`.
   - Never use `--force`, never discard uncommitted work, never reset.
5. Sync the default branch from its dedicated worktree with a fast-forward only merge,
   using `git -C <path>` so the merge always targets the default worktree regardless
   of the current shell directory:
   `git -C <path> merge --ff-only origin/<default>`.
   If the default worktree is dirty or divergent, report it and skip instead of resetting.
6. Conclude the operation without switching branches. Because Steps 4 and 5 used
   `git -C <path>` to operate on the default worktree directly, the current shell's
   working directory and branch were never changed — each worktree owns its checkout.

Do not use `git fetch --tags`, `git fetch --prune-tags`, or `git pull --tags` during the
normal refresh. Tags are audited separately in Step 4 so local-only non-release tags and
tag rewrites are not deleted by a broad fetch refspec.

Branch and worktree cleanup — local, remote, and bare-local — is
`prune-branches` (github-workflows), run separately after this sync.

### 4. Tag Audit And Cleanup

Treat `origin` as authoritative for release tags only.

Use native Git commands to compare local tags to remote tags:

```bash
git for-each-ref '--format=%(refname:short)' refs/tags
git show-ref --tags
git ls-remote --tags --refs origin
```

For local-only tags:

1. If the tag name matches the release tag pattern `v[0-9]*`, delete it with
   `git tag -d <tag>`.
2. If the tag name does not match the release tag pattern, report it and do not delete it.

For tags that exist both locally and on origin but point at different objects, report the
mismatch and do not force-update it automatically. Never delete or rewrite remote tags.

### 5. Summary

Report: PRs assessed as merge-ready (if any), tags deleted or reported,
default-branch worktree restorations (with any stash references created),
current branch, and sync status.

## Common Mistake to Avoid

**DO NOT** skip the PR check just because you're on main. The user may have multiple open PRs from different branches.

Always run `gh pr list --author @me --state open` to find work that needs merging.

Do not use `--prune-tags` as a shortcut for tag cleanup. Git treats tag pruning as an
explicit refspec prune and can delete local-only tags that are not release artifacts.

## Related Skills

- **prune-branches** (github-workflows) — stale branch and worktree cleanup, run after this sync
- **sync-main** (git-workflows) — Syncs the default branch and merges into current or all PR branches
- **rebase-pr** (github-workflows) — Rebase-merge workflow for merging individual PRs
- **git-workflow-standards** (git-standards) — Worktree structure and branch hygiene conventions
- **gh-cli-patterns** (github-workflows) — Canonical gh CLI command shapes, placeholder convention, PR-readiness gate, default-branch detection
