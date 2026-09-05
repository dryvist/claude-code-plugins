---
name: replan
description: "Rebuild a plan from live ground truth — the artifacts themselves, tests, and (in a repository) git and gh — when the existing plan file no longer matches reality — items silently done, approach superseded, or facts drifted. Use when a plan has gone stale mid-effort or when resuming reveals contradictions. Re-derives ground truth first, never trusting the plan's own prose, then rewrites the plan to match what is actually true and what actually remains."
---

# Replan

Rebuild a stale plan from reality. A plan file records what was true when written.
Work moves on: items get done without the box being checked, a PR supersedes an
approach, a claimed-live system turns out to have never shipped. Replanning
**re-derives ground truth, then rewrites the plan to match** — it never edits the
plan by trusting the plan.

Trigger: a plan drifted from reality — a step can outlive the decision that
banned it — or `/resume` surfaced contradictions between the plan and live state.

> **State warning**: the plan is the least trustworthy source in the room. Derive
> from whichever ground-truth sources this environment actually has — then correct
> the plan.

## Step 1: Re-derive ground truth (ignore the plan's claims)

Establish what is actually true right now, independent of what the plan says.
Use every source available; skip the ones this environment does not have.

- **The artifact itself**: read the file, run the test, hit the endpoint. This
  source always exists and outranks every claim about it.
- **Config vs running**: a config default is not the running system. If the plan
  claims a capability is "live", check the thing itself (the mount, the secret, the
  endpoint), not the flag that would enable it. (This is the exact trap that makes
  plans go stale — a default read as a fact.)
- **Box-drawn CLI output is not a list**: `doppler secrets --only-names` and
  tools like it print a bordered table. Strip the borders before diffing:
  `grep '^│' | sed 's/[│ ]//g'`.
- **Decisions**: scan for anything that invalidates a plan step — a new rule, a
  closed ticket, a design the user changed mid-flight.
- **Version control** *(only when `git rev-parse --is-inside-work-tree` succeeds)*:
  shipped work via `gh pr list --state merged` plus the default-branch log;
  in-flight work via open PRs, their real mergeable/CI state, pushed branches, and
  worktrees. Run the resolution and its use as **one block** — they must share a
  shell (see
  [ARCHITECTURE.md](../../ARCHITECTURE.md#resolving-the-default-branch)):

  ```bash
  default_branch=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)
  default_branch=${default_branch#origin/}
  [ -n "$default_branch" ] || default_branch=$(
    gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null)

  if [ -z "$default_branch" ]; then
    echo "default branch unknown — shipped work not derivable from git"
  elif ! git rev-parse --verify "origin/$default_branch" >/dev/null 2>&1; then
    echo "origin/$default_branch not fetched — run: git fetch origin $default_branch"
  else
    git log --oneline -30 "origin/$default_branch"
  fi
  ```

  Bound the log: the goal is what shipped recently, not the branch's entire
  history. Widen the count or add a date range only if the plan predates it.

Note any source you could not reach. An unreachable source is an unknown, never
an implicit "nothing there".

### Delegate the bulk read

Steps above produce token-heavy, reasoning-light output: the default-branch
log, merged/open PR listings with their CI state, and the plan file's checkbox
inventory. Hand that raw material to the **router** via the `delegate-to-router`
skill (ai-delegation) at the cheapest capable tier — alias `cheap`, or a
subagent carrying an explicit lower `model:` when the input is longer than one
call holds. Reason over the returned table, never the raw dump.

Cap the input: at most 30 log lines, 30 PRs, and the plan file itself. Truncate
rather than paginate — more evidence is not a better reconciliation.

Small-model prompt (short imperatives, explicit schema, hard STOP):

```text
Extract facts from the input. Do not explain. Do not advise.
Output ONLY this table, one row per plan item or PR:
  id | title | state (MERGED/OPEN/CLOSED/CHECKED/UNCHECKED) | evidence
Rules:
1. Copy titles verbatim. Never summarize a title.
2. Unknown field -> write UNKNOWN. Never guess.
3. At most 60 rows. STOP after the table.
```

**Fallback (verbatim from `delegate-to-router`)**: none of the router's failure
paths authorize a silent fallback. "Absorbing the work back into your own
context without saying so is the exact cost delegation was meant to avoid, and
it hides the failure from whoever pays for it." If the router is unreachable,
do the step yourself and **say so in the Step 4 delta**. Never silently skip it.

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

- **resume** (this plugin) — continue work cold; calls replan when the plan is broadly stale.
- **session-status** (this plugin) — live-state derivation reused here.
- **handoff** (this plugin) — emits a fresh prompt from the replanned state.
- **writing-plans** (superpowers) — when there is no plan to correct and one must
  be written from scratch.
- **autoresearch:plan** — when the replanned goal needs a measurable metric and an
  automated verify command rather than prose criteria.
- **delegate-to-router** (ai-delegation) — the router mechanics used by "Delegate the bulk read": live model menu, tier choice, and the fallback rule.
