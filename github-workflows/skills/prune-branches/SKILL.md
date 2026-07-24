---
name: prune-branches
description: Delete branches and worktrees with nothing useful — zero commits ahead of default, or a matched merged PR — local and remote, single-repo or workspace-wide. Run after refresh-repo syncs the default branch.
---

# Prune Branches

Delete branches and worktrees carrying no unique, unmerged work: local,
remote, or both.

> **State warning**: Branch state, remote tracking, and PR status change between
> invocations. Re-run every git/gh command from the top on each run.

## Protected

Skip these before computing staleness, on every pass below — each pass
re-checks independently:

- The default branch (`main`/`master`/`develop`) and any branch checked out
  in a worktree. Git enforces this for passes 1–2 via `branch -d`/`-D`; pass
  3 deletes a different ref, so check explicitly there too.
- Any branch an open PR references as `--head` or `--base` — `--base`
  catches a stacked PR's target.

Build the open-PR reference set once, at the top of the run, not per branch:

```bash
gh pr list --state open --json number,headRefName,baseRefName --limit 200
```

Union `headRefName` and `baseRefName` into one set; test membership against
it in every pass below instead of a per-branch `gh pr list` call.

## Stale

A branch clears Protected and meets either:

- **Zero commits ahead of the default branch** —
  `git merge-base --is-ancestor <ref> origin/<default>` (equivalent to
  `git log origin/<default>..<ref> --oneline` returning nothing). Ignores
  `[gone]` status — the ancestor check, not `[gone]`, is the real "merged"
  signal. Run the default-branch guard first: `origin/main` is routinely an
  ancestor of `origin/develop` on a git-flow repo.
- A merged PR (most recent by `mergedAt`) whose `headRefOid` matches the
  branch tip — `gh pr list --state merged --head <branch> --json
  number,headRefOid,mergedAt`. Needed for squash-merges, where the branch's
  own commits are never literal ancestors of the default branch.

## Passes

Three passes, one per ref shape:

1. **Worktree-paired branches** — `git worktree list` (skip bare repo
   entries). If Stale: `git worktree remove <path>` — never `--force`; a
   dirty worktree blocks removal, report and skip. Then `git branch -d
   <branch>` (fall back to `-D` only when the merged-PR `headRefOid` matched
   the branch tip before removal — a squash-merged branch unreachable from
   local default).
2. **Bare local branches** — local branches with no worktree
   (`git for-each-ref refs/heads`, excluding pass-1 branches). If Stale:
   `git branch -d <branch>` (same `-D` fallback as pass 1).
3. **Remote-only branches** — remote branches with no local ref
   (`git branch -r`, excluding `origin/HEAD` and anything with a local
   counterpart). Check Stale against `origin/<branch>` directly; its only
   action is the remote delete below.

Finish with `git worktree prune`.

## Remote delete

Passes 1 and 2 trigger this after their local `git branch -d`/`-D`
succeeds; pass 3 goes straight here. If a live (non-`[gone]`) remote ref
exists: `git push origin --delete` ignores tip state, so immediately before
this specific push — not once at the top of the run — refresh and
re-confirm:

```bash
git fetch origin <branch> <default>
git merge-base --is-ancestor origin/<branch> origin/<default>
```

Skip and report if it no longer holds. Otherwise: `git push origin --delete
<branch>`.

## Cross-Repo Operating Modes

Optional modes that widen this from single-repo to workspace-wide. Both
reuse Protected + Stale and the deletion rules above — they only add
pre-filters on top of every rule above.

### `--sweep [<repo-glob>]`

Multi-repo cleanup of abandoned local branches. For every default-branch
worktree in your workspace (pass a custom glob for a non-standard layout),
resolve that repo's own default branch first (`main` on trunk repos,
`develop` on git-flow repos), then for every local branch where
`git log origin/<default>..HEAD` is non-empty:

1. **Content-equivalence check**: compute merge base, diff each touched file
   against current `origin/<default>`. If every touched file is
   content-equivalent to (or older than) `origin/<default>`, delete the
   branch and its worktree. An already-on-default contribution doesn't need
   a PR.
2. **Workaround filter**: surface for human review, don't draft-PR, when the
   diff (a) modifies 1 of N files sharing a common shape with no written
   rationale for the asymmetry, or (b) names a "sync mechanism" /
   "auto-update" that `grep -r <name> .` finds zero matches for.
3. Only branches passing both checks become draft PRs.
4. Per-repo summary: branches deleted as content-equivalent, branches
   surfaced for review, branches PR-ified, branches unchanged.

**Origin**: the 2026-05-22 sweep opened 8 dead PRs against `ansible-splunk`
(6 already-on-main duplicates, 2 workaround anti-patterns). Both filters
above would have caught all 8 before any CI ran.

### `--prune-stale <days>` (default 60)

Delete local branches with no open PR and no push activity within `<days>`.
Adds a time threshold on top of Stale; every rule above still applies.

Per branch: if `gh pr list --head <branch>` is empty and
`git log -1 --format=%cr <branch>` is older than `<days>`, run
`git worktree remove <path>` (never `--force`) then `git branch -d <branch>`.

Use `--prune-stale 30` for an aggressive sweep, `--prune-stale 90` for
conservative.

## Related Skills

- **refresh-repo** (github-workflows) — sync the default branch first
- **git-workflow-standards** (git-standards) — worktree and branch conventions
- **gh-cli-patterns** (github-workflows) — canonical gh CLI command shapes, default-branch detection
