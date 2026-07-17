---
name: resume
description: "Pick up unfinished work cold in a fresh session by re-deriving state from live git, gh, the plan file, and TaskList — never from remembered or pasted claims. Use at the start of a new session that continues prior work, or when handed a resume prompt. Verifies what is actually merged, open, committed, and checked-off right now, reconciles it against the plan, then states exactly where things stand and what the next action is before touching anything."
---

# Resume

Continue unfinished work in a session that has no memory of how it got here. The
core rule: **trust live state, never prose.** A resume prompt, a plan file, or a
prior summary describes what *was* true. Before acting, verify what *is* true.

This exists because "Continue from where you left off" was typed ~53 times and
"fresh creds / fresh session" ~43 — the recurring need to resume cold without
redoing merged work or trusting a stale claim.

> **State warning**: everything below drifts. A PR called "open" in the prompt may
> be merged; a plan item marked `[ ]` may be done. Re-derive all of it now.

## Step 1: Locate the work

- Read the plan file. The resume prompt should name it (`~/.claude/plans/<slug>.md`);
  if not, find the most recent under `~/.claude/plans/`.
- `TaskList` — the pending/in-progress items.
- The worktree(s) the work lives in (the prompt's `cd` block, or `git worktree list`).

## Step 2: Re-derive live state (never trust the prompt's claims)

For every claim the prompt or plan makes, run the check that confirms it:

- **"PR #N is open"** → `gh pr view <N> --json state,mergedAt` — it may be merged or closed.
- **"branch X exists / is pushed"** → `git branch`, `git status -sb`, `git log origin/<branch>`.
- **"file Y still needs Z"** → read file Y; the change may already be there.
- **"item is done / not done"** → the plan checkbox is a claim, not proof. Confirm
  against the repo (merged PR, committed file, passing test).
- **Merged vs local**: `git log origin/main..HEAD` and `gh pr list --state merged`
  — work you think is pending may already be on main.

Reconcile: build the *actual* remaining set = plan/TaskList items minus anything
live state shows already done. Shrinking the list is the point — never redo merged work.

## Step 3: State where things stand, then continue

Before editing anything, print a short reconciliation so the user can confirm:

```text
Resumed: <objective, one line>
  Already done (verified live):  <items live state proved complete>
  Actually remaining:            <the reconciled open set>
  Next action:                   <the single next step>
  Working dir:                   <worktree path>
```

Then do the next action. Do not start by redoing something a merged PR already
shipped. If live state contradicts the plan (a "pending" item is done, a "done"
item regressed), say so explicitly — the contradiction is a finding, not noise.

## When the plan itself looks stale

If re-derivation shows the plan is broadly out of date (many items done, the
approach superseded), stop and invoke `/replan` instead of resuming against a plan
that no longer matches reality.

## Related Skills

- **replan** (git-workflows) — re-derive the whole plan from live state when the
  plan file no longer matches reality.
- **session-status** (git-workflows) — the live-state derivation this skill reuses.
- **handoff** (git-workflows) — the artifact a resume prompt is typically built from.
