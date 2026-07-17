---
name: replan
description: "Rebuild a plan from live git, gh, and repo state when the existing plan file no longer matches reality — items silently done, approach superseded, or facts drifted. Use when a plan has gone stale mid-effort or when resuming reveals contradictions. Re-derives ground truth first, never trusting the plan's own prose, then rewrites the plan to match what is actually true and what actually remains."
---

# Replan

Rebuild a stale plan from reality. A plan file records what was true when written.
Work moves on: items get done without the box being checked, a PR supersedes an
approach, a claimed-live system turns out to have never shipped. Replanning
**re-derives ground truth, then rewrites the plan to match** — it never edits the
plan by trusting the plan.

Trigger: a plan drifted from reality (this happens — a "seed the KV path" step can
outlive the decision that banned it), or `/resume` surfaced contradictions between
the plan and live state.

> **State warning**: the plan is the least trustworthy source in the room. Derive
> from git, gh, the filesystem, and Doppler/CI as applicable — then correct the plan.

## Step 1: Re-derive ground truth (ignore the plan's claims)

Establish what is actually true right now, independent of what the plan says:

- **Shipped**: `gh pr list --state merged`, `git log origin/main`, released versions.
- **In flight**: open PRs and their real mergeable/CI state; pushed branches; worktrees.
- **Config vs running**: a config default is not the running system. If the plan
  claims a capability is "live", check the thing itself (the mount, the secret, the
  endpoint), not the flag that would enable it. (This is the exact trap that makes
  plans go stale — a default read as a fact.)
- **Decisions**: scan for anything that invalidates a plan step — a merged rule, a
  closed issue, a design the user changed mid-flight.

## Step 2: Reconcile against the plan

For each plan item, classify from live evidence, not the checkbox:

| Live evidence says | Action |
| --- | --- |
| Done (merged/committed/passing) | mark complete; do not carry forward |
| Now invalid (banned/superseded/wrong) | strike it; note why in one line |
| Still valid + open | keep, refresh any drifted facts (paths, PR #s, line #s) |
| Newly required (a gap live state exposed) | add it |

## Step 3: Rewrite the plan file

Rewrite the plan to match reality. Not a patch over the old prose — the corrected
plan. Preserve hard-won context (evidence, decisions, links) but cut instructions
that live state has invalidated, so a fresh session cannot follow a dead step.

- Keep it scannable: what is done, what remains, in dependency order.
- Every PR/issue as a full URL; every file as an absolute path.
- If a correction reverses earlier guidance, say so plainly — a future reader must
  not re-derive the mistake the plan used to encode.
- Record what shipped since the plan was written, so no one redoes it.

## Step 4: Confirm the delta

State what changed, so the user sees the correction:

```text
Replanned: <plan file path>
  Marked done:     <items live state proved complete>
  Struck:          <items now invalid + one-line why>
  Still open:      <reconciled remaining set, in order>
  Newly added:     <gaps live state exposed>
```

If the plan is in plan mode, only the plan file may be edited — do the rewrite
there and exit via the normal plan-approval path. Otherwise edit the plan file
directly.

## Related Skills

- **resume** (git-workflows) — continue work cold; calls replan when the plan is broadly stale.
- **session-status** (git-workflows) — live-state derivation reused here.
- **handoff** (git-workflows) — emits a fresh prompt from the replanned state.
