---
name: pr-sweep
description: "Use when open pull requests have piled up in one repo or across an owner's repos and you want the pile triaged and driven toward zero in one pass — including when most of them are bot- or teammate-authored. Also use when a sweep must run many repos in parallel without racing approvals or flooding CI."
---

# PR Sweep

Drive a pile of open PRs toward zero: merge what is safe, repair what is
cheaply repairable, and surface the rest with a concrete reason each. This is
triage-and-clear on **open PRs**; `/prune-branches --sweep` acts on
**repo/worktree state** and is a different job.

This skill decides **which** PRs move and in **what order**. It never
reimplements merging: each merge is delegated to `/merge-pr`, each repair to
`/finalize-pr`.

## Invariants

These four hold in every mode. They are the difference between a sweep and a
stampede.

1. **Triage is read-only and confers no merge authority.** Classifying a PR
   never merges it.
2. **A merge happens only against an execution order that pins the head
   commit.** If the head moved since triage, the order is void — re-triage.
   This is what makes an approval round impossible to race.
3. **Serialize within a repo; parallelize across repos.** Merge ordering,
   broken-base diagnosis, and repo-wide gates are all repo-scoped.
4. **Cap concurrent merges globally** (default 2–3). Every merge triggers CI,
   and CI capacity is finite and shared.

Never pass `--admin`. Never merge a draft. Never bypass a failing check —
repair it or hold the PR.

> **State warning**: PR status, CI, and mergeability change constantly, and
> `mergeable`/`mergeStateStatus` are computed lazily — a first query often
> returns `UNKNOWN`. Re-query before classifying, and never act on a list
> gathered earlier in the session.

## Merge method is not this skill's business

`/merge-pr` resolves the merge method from the repo's capabilities and the
branching model — see **git-flow-next** (git-workflows) for which method each
target branch requires. This skill passes no method flag and states no
default. A promotion PR into a production branch is never swept: hold it and
point at `/promote-release`.

## Scope

- `/pr-sweep` — open PRs in the current repo.
- `/pr-sweep --org <owner>` — open PRs across the owner's repos, **all
  authors**. Bot and teammate PRs are usually the bulk of a real pile.
- `--author <login>` — optional filter. Do not default to "mine": some token
  types (app installation tokens) carry no user identity, so a self-filter
  silently returns nothing.

Command shapes live in **gh-cli-patterns**. List first, act second, and state
the count before touching anything.

## Phases

Run all five in order. Phases 1 and 3 fan out; 0, 2, and 4 are the lead's.

- **Phase 0 — Manifest (lead).** Enumerate repos × open PRs in one pass.
  Report the count. Spawn one worker per repo, capped (default 4 concurrent).
- **Phase 1 — Triage (workers, parallel, read-only).** Each worker classifies
  every PR in its repo and detects repo-level conditions (broken base,
  repo-wide gate). Output: one report block per repo. No writes.
- **Phase 2 — Approval (lead, one round).** Batch **all** escalations into a
  single round — one short paragraph per PR: identity, diffstat, state, and
  the specific yes/no question. No diffs. Then issue per-repo execution
  orders: `(PR number, head OID)` plus any ordering constraints.
- **Phase 3 — Execute (workers).** Continue the *same* worker by message so it
  keeps its triage context. Per repo, serially: take a merge-budget slot,
  assert the head OID still matches, delegate to `/merge-pr`, wait on
  merge-triggered CI with an event-driven monitor, release the slot. `FIX`
  items go to `/finalize-pr`, then back through triage.
- **Phase 4 — Verify and report (lead).** Wait for merge-triggered CI to
  settle, then attribute every red by timestamp against merge time before
  claiming a clean sweep.

The lead does exactly two blocking things: the Phase 2 round and the Phase 4
aggregation. It never re-derives repo state itself.

## Classification

Every PR gets exactly one verdict.

| Verdict | Meaning |
| --- | --- |
| **MERGE** | Mergeable, checks green, not draft, no unresolved threads, and either low blast radius or an approved escalation. |
| **FIX** | One delegated `/finalize-pr` away from mergeable — unresolved review threads, a stale rollup, a repairable check. Re-triage after. |
| **HOLD** | Cannot proceed without a decision or new work. Always carries a reason. |
| **ESCALATE** | Mergeable but the *judgment* is not the sweep's to make. Goes to Phase 2 as a question, never as an assumption. |

Rank up when unsure. A surfaced PR costs a glance; a wrongly-merged one costs
a revert.

## Hold reasons (never auto-merge)

- Draft, merge conflicts, or checks failing for a real (non-infrastructure)
  reason.
- A promotion PR into a production branch — use `/promote-release`.
- Changes touching auth, secrets, migrations, permissions, or live infra — a
  human decides.
- An explicit human "do not merge", or a review-gate label. A prior human
  refusal outranks the sweep.
- `/merge-pr` refused — carry its reason forward verbatim.
- A PR another session is actively working (recently pushed, in flight).

## Report

```text
PR Sweep — <scope>
  Merged:     <repo#N> — <title>
  Fixed+merged: <repo#N> — <what was repaired>
  Held:       <repo#N> — <reason>
  Escalated:  <repo#N> — <question> → <decision>
  Repo findings: <broken base | repo-wide gate | infra failure>
  Open before → after: <b> → <a>
```

Every PR is merged or listed with a concrete reason — never silently skipped.
A sweep that merges nothing is a valid outcome. File follow-ups per the
project's issue-routing convention, and end a run that is blocked on a human
decision by naming that decision.

## Mechanics

Diagnosis and parallel-protocol detail — lazy state, `UNSTABLE` vs `BLOCKED`,
broken-base proof, repo-wide gates, infrastructure-failure signatures, worker
and order schemas: see [references/sweep-mechanics.md](references/sweep-mechanics.md).

## Related Skills

- **merge-pr** (github-workflows) — performs each merge and owns method resolution.
- **finalize-pr** (github-workflows) — drives one PR to mergeable; the `FIX` delegate.
- **resolve-pr-threads** (github-workflows) — review-thread resolution.
- **gh-cli-patterns** (github-workflows) — canonical command shapes and queries.
- **promote-release** (github-workflows) — the held-promotion path.
- **git-flow-next** (git-workflows) — the branching model that decides merge method.
- **prune-branches**, **refresh-repo** (github-workflows) — complementary cleanup.
