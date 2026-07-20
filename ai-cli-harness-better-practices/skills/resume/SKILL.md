---
name: resume
description: "Pick up unfinished work cold in a fresh session by re-deriving state from live git, gh, the plan file, and TaskList — never from remembered or pasted claims. Use at the start of a new session that continues prior work, or when handed a resume prompt. Verifies what is actually merged, open, committed, and checked-off right now, reconciles it against the plan, then states exactly where things stand and what the next action is before touching anything."
---

# Resume

Continue unfinished work in a session that has no memory of how it got here. The
core rule: **trust live state, never prose.** A resume prompt, a plan file, or a
prior summary describes what *was* true. Before acting, verify what *is* true.

This exists because resuming cold is common and easy to get wrong: the failure
mode is redoing work that already shipped, or acting on a claim that has since
gone stale.

> **State warning**: everything below drifts. A PR called "open" in the prompt may
> be merged; a plan item marked `[ ]` may be done. Re-derive all of it now.

## Step 1: Locate the work

- Read the plan file. The resume prompt should name it (`<HOME>/.claude/plans/<slug>.md`);
  if not, find the most recent under `<HOME>/.claude/plans/`.
- `TaskList` — the pending/in-progress items.
- The directory the work lives in — the prompt's `cd` block. Only if that is
  missing and `git rev-parse --is-inside-work-tree` succeeds, widen the search
  with `git worktree list`.

## Step 2: Re-derive live state (never trust the prompt's claims)

For every claim the prompt or plan makes, run the check that confirms it. Pick
the cheapest evidence source that can actually falsify the claim:

| Evidence source | Confirms |
| --- | --- |
| The file itself | "file Y still needs Z" — read it; the change may already be there |
| Test or build output | "it works" / "it's broken" — run it |
| `TaskList` and the plan checkbox | a *claim*, never proof — treat as the thing to verify, not the verification |
| Filesystem | "the artifact was generated", "the config exists" |
| Version control *(repository only)* | "branch X is pushed", "PR #N is open", "already merged" |

The version-control row is gated:

```bash
git rev-parse --is-inside-work-tree >/dev/null 2>&1
```

When it succeeds, add `gh pr view <N> --json state,mergedAt` (a PR called open
may be merged), `git status -sb`, and `gh pr list --state merged` to catch work
already shipped.

To find commits not yet on the default branch, run this as **one block** — the
resolution and its use must share a shell (see
[ARCHITECTURE.md](../../ARCHITECTURE.md#resolving-the-default-branch)):

```bash
default_branch=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)
default_branch=${default_branch#origin/}
[ -n "$default_branch" ] || default_branch=$(
  gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null)

if [ -z "$default_branch" ]; then
  echo "default branch unknown — cannot tell shipped from unshipped"
elif ! git rev-parse --verify "origin/$default_branch" >/dev/null 2>&1; then
  echo "origin/$default_branch not fetched — run: git fetch origin $default_branch"
else
  git log --oneline "origin/$default_branch..HEAD"
fi
```

Never interpolate an unresolved default: `git log ""..HEAD` exits 0 with no
output, which reads as "nothing unshipped" and would make this skill redo work
that already merged — the precise error it exists to prevent.

When the guard fails, skip the row — the other sources still reconcile the plan.

Reconcile: build the *actual* remaining set = plan/TaskList items minus anything
live evidence shows already done. Shrinking the list is the point — never redo
finished work.

## Step 3: State where things stand, then continue

Before editing anything, print a short reconciliation so the user can confirm:

```text
Resumed: <objective, one line>
  Already done (verified live):  <items live state proved complete>
  Actually remaining:            <the reconciled open set>
  Next action:                   <the single next step>
  Working dir:                   <absolute path>
```

Then do the next action. Do not start by redoing something already shipped. If
live evidence contradicts the plan (a "pending" item is done, a "done" item
regressed), say so explicitly — the contradiction is a finding, not noise. Name
any evidence source you could not reach, so the gap is visible rather than
silently treated as "nothing there".

## When the plan itself looks stale

If re-derivation shows the plan is broadly out of date (many items done, the
approach superseded), stop and invoke `/replan` instead of resuming against a plan
that no longer matches reality.

## Related Skills

- **replan** (this plugin) — re-derive the whole plan from live state when the
  plan file no longer matches reality.
- **session-status** (this plugin) — the live-state derivation this skill reuses.
- **handoff** (this plugin) — the artifact a resume prompt is typically built from.
