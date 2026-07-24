---
name: refresh-repo
description: Check PR merge readiness, sync local repo, cleanup stale branches and worktrees (local and remote); optional cross-repo sweep and stale-branch prune modes
---

<!-- cspell:words refspec oneline headRefOid mergedAt -->

# Git Refresh

Check open PR merge-readiness status, sync the local repository, and cleanup stale branches and worktrees.

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

Local and remote branch cleanup (including bare local branches with no
worktree) happens in Step 5, not here — Step 5's stale definition is a strict
superset of "already merged into default."

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

### 5. Branch and Worktree Cleanup

Only remove a branch or worktree if it is confirmed stale.

**Protected — never touch, regardless of any other check below.** Check this
FIRST, before computing staleness, on every one of the three passes below —
each pass runs independently and none may assume an earlier pass already
checked it:

- The default branch (`main`/`master`/`develop`) and the branch currently
  checked out in any worktree in this repo. (Git itself refuses
  `branch -d`/`-D` on a branch checked out in some worktree, so passes 1–2
  are doubly protected — but pass 3's remote delete is a different ref and
  is NOT protected by that, so check explicitly there too.)
- Any branch referenced by an open PR as **either** `--head` or `--base` —
  `--head` alone misses a branch that's the base of someone's stacked PR:

  ```bash
  gh pr list --head <branch> --state open --json number
  gh pr list --base <branch> --state open --json number
  ```

**Stale definition** (branch passes this check only after clearing
Protected, above): no uncommitted changes (when a worktree exists), and
either:

- **Zero commits ahead of the default branch** —
  `git merge-base --is-ancestor <ref> origin/<default>` (equivalent to
  `git log origin/<default>..<ref> --oneline` being empty). Unconditional —
  does NOT require `[gone]` status. This is a deliberate widening from an
  earlier version of this rule that gated on `[gone]` as a proxy for
  "probably merged"; the ancestor check is the real signal. The Protected
  guard above is what keeps this widening safe on git-flow repos, where
  `origin/main` is routinely an ancestor of `origin/develop` (the actual
  default there) — never skip that guard to save a step.
- The branch has a merged PR (most recently merged by `mergedAt`) whose
  `headRefOid` matches the branch tip
  (`gh pr list --state merged --head <branch> --json number,headRefOid,mergedAt`) —
  still needed for squash-merges, where the branch's own commits are never
  literal ancestors of the default branch.

Apply Protected + Stale in three passes — each covers a different ref shape
existing checks miss:

1. **Worktree-paired branches**, from `git worktree list` (skip bare repo
   entries). If stale: `git worktree remove <path>` — never `--force`; if
   Git blocks removal for a dirty worktree, report and skip. Then
   `git branch -d <branch>` (fall back to `-D` only when the merged-PR
   `headRefOid` matched the branch tip before removal, e.g. a squash-merged
   branch unreachable from local default).
2. **Bare local branches** — local branches with no worktree
   (`git for-each-ref refs/heads`, excluding branches already covered by
   pass 1). If stale: `git branch -d <branch>` (same `-D` fallback as pass 1).
3. **Remote-only branches** — remote branches with no local ref at all
   (`git branch -r`, excluding `origin/HEAD` and anything with a local
   counterpart). Check Stale against `origin/<branch>` directly (no local
   ancestry to walk, no local `git branch -d` to run — this pass has nothing
   local to delete, so its only action IS the remote delete below).

**Remote delete.** Passes 1 and 2 trigger it after their local
`git branch -d`/`-D` succeeds; pass 3 has no local step, so a Stale
remote-only branch goes straight here. If a live (non-`[gone]`) remote
tracking ref exists, delete it: `git push origin --delete` ignores tip
state — if someone pushed new commits to the branch between your last fetch
and now, a plain delete would silently discard them, no `--force` needed. So
immediately before this specific push (not once at the top of the run):
`git fetch` and re-confirm `git merge-base --is-ancestor origin/<branch>
origin/<default>` still holds; skip and report if it no longer does.
Otherwise: `git push origin --delete <branch>`.

Finish with `git worktree prune`.

### 6. Summary

Report: PRs assessed as merge-ready (if any), tags deleted or reported, branches cleaned up,
worktrees removed, default-branch worktree restorations (with any stash references created),
current branch, and sync status.

## Cross-Repo Operating Modes

Optional modes that change `/refresh-repo` from single-repo to workspace-wide.
Both modes reuse the Protected + Stale definition and deletion rules from
Step 5 — they only add new pre-filters, never weaken existing safety.

### `--sweep [<repo-glob>]`

Multi-repo cleanup of abandoned local branches. For every default-branch
worktree in your workspace (caller can pass a custom glob if their layout
differs), resolve that repo's own default branch first (per Step 3 above —
`main` on trunk repos, `develop` on git-flow repos), then for every local
branch where `git log origin/<default>..HEAD` is non-empty:

1. **Content-equivalence check**: compute merge base, diff each touched file
   against current `origin/<default>`. If every touched file is content-equivalent
   to (or older than) `origin/<default>`, delete the branch and its worktree.
   Already-on-the-default-branch contributions do not deserve a PR.
2. **Workaround filter**: if the diff (a) modifies 1 of N files sharing a
   common shape with no written rationale for the asymmetry, or (b) references
   a "sync mechanism" / "auto-update" by name that `grep -r <name> .` returns
   zero matches for, surface for human review. Do not open a draft.
3. Only branches passing both checks become draft PRs.
4. Per-repo summary: branches deleted as content-equivalent, branches surfaced
   for review, branches PR-ified, branches unchanged.

**Origin**: the 2026-05-22 sweep opened 8 dead PRs against `ansible-splunk`
(6 already-on-main duplicates, 2 workaround anti-patterns). Both filters
above would have caught all 8 before any CI ran.

### `--prune-stale <days>` (default 60)

Delete local branches with no open PR and no push activity within `<days>`.
Expands Step 5's stale definition with a time threshold; still respects every
safety rule (never delete branches with open PRs, uncommitted changes, or
the current checkout).

Per branch: if `gh pr list --head <branch>` is empty AND
`git log -1 --format=%cr <branch>` is older than `<days>`, run
`git worktree remove <path>` (per Step 5 — never `--force`) then
`git branch -d <branch>`.

Use `--prune-stale 30` for an aggressive sweep, `--prune-stale 90` for
conservative.

## Common Mistake to Avoid

**DO NOT** skip the PR check just because you're on main. The user may have multiple open PRs from different branches.

Always run `gh pr list --author @me --state open` to find work that needs merging.

Do not use `--prune-tags` as a shortcut for tag cleanup. Git treats tag pruning as an
explicit refspec prune and can delete local-only tags that are not release artifacts.

## Related Skills

- **sync-main** (git-workflows) — Syncs the default branch and merges into current or all PR branches
- **rebase-pr** (github-workflows) — Rebase-merge workflow for merging individual PRs
- **git-workflow-standards** (git-standards) — Worktree structure and branch hygiene conventions
- **gh-cli-patterns** (github-workflows) — Canonical gh CLI command shapes, placeholder convention, PR-readiness gate, default-branch detection
