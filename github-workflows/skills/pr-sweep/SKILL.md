---
name: pr-sweep
description: "Use when open PRs pile up in one repo or across an owner's repos; triage and drive them through repeated rounds until no open in-scope PR created more than 24 hours ago remains."
---

# PR Sweep

Drive open PRs toward zero through repeated rounds: merge what is safe, repair
what is cheaply repairable, and give every other stale PR an owner, next action,
and wake condition. This is triage-and-clear on **open PRs**;
`/prune-branches --sweep` acts on **repo/worktree state** and is a different job.

This skill decides **which** PRs move and **in what order**. It never
reimplements merging: each merge is delegated to `/merge-pr`, each repair to
`/finalize-pr`.

## Completion contract

- Complete only when a fresh query at the end of a round returns zero open
  in-scope PRs whose `createdAt` is older than 24 hours.
- Any nonzero stale count is a round boundary, not completion. PRs younger than
  24 hours may be triaged opportunistically and never block completion.
- Report the stale count at the start and end of every round.
- A run blocked on a human stays running: send the batched ask, schedule the
  next round under the cadence rules, and continue the same workers.
- Finish Phase 5 validation before the end-of-round query. A merge is not done
  until its required post-merge validation passes.

## Invariants

These five hold in every mode. They are the difference between a sweep and a
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
5. **Every stale PR has exactly one owner, one next action, and one wake
   condition at every round boundary.**

Never pass `--admin`. Never merge a draft. Never bypass a failing check —
repair it or route it to ESCALATE or HANDOFF.

> **State warning**: PR status, CI, and mergeability change constantly, and
> `mergeable`/`mergeStateStatus` are computed lazily — a first query often
> returns `UNKNOWN`. Re-query before classifying, and never act on a list
> gathered earlier in the session.

## Merge method is not this skill's business

`/merge-pr` resolves the merge method from the repo's capabilities and the
target branch. For branch and PR-target conventions, follow the
[Git Town rule](https://github.com/dryvist/ai-llm-prompts/blob/main/auto-ai-agent/instructions/agentsmd/rules/on-demand/git-flow.md).
This skill passes no method flag and states no default. A promotion PR into a
production branch goes to `/promote-release`.

## Scope

- `/pr-sweep` — open PRs in the current repo.
- `/pr-sweep --org <owner>` — open PRs across the owner's repos, **all
  authors**. Bot and teammate PRs are usually the bulk of a real pile.
- `--author <login>` — optional filter. Do not default to "mine": some token
  types (app installation tokens) carry no user identity, so a self-filter
  silently returns nothing.

**Claude project route:** run one project thread per repository instead of the
local fan-out; see [the claude-projects rule](https://github.com/dryvist/ai-assistant-instructions/blob/develop/agentsmd/rules/on-demand/claude-projects.md).

Command shapes live in **gh-cli-patterns**. List first, act second, and state
the count before touching anything. Every `MERGE` verdict must pass the
[canonical PR-readiness gate](../gh-cli-patterns/SKILL.md#canonical-pr-readiness-gate),
including zero unaddressed feedback items and all required checks reported.
Use the [PR feedback ledger](../gh-cli-patterns/references/pr-feedback-ledger.md)
for comment, review-body, inline, and review-agent findings.

## Phases

Run all seven phases in order. Phases 1 and 3 fan out; 0, 2, and 4–6 are the
lead's. Each round begins with the cadence gate and reports its starting stale
count.

- **Phase 0 — Manifest (lead).** Enumerate repos × open PRs in one pass and
  report total open and stale counts. Probe the spawn substrate, then launch
  one worker per independent, ready repo in parallel; if spawning fails, run
  the sweep solo.
- **Phase 1 — Triage (workers, parallel, read-only).** Classify every stale PR
  and any younger PR chosen for opportunistic triage. Detect repo-level
  conditions (broken base, repo-wide gate) and gather GitHub, local branch /
  worktree, and live-session evidence per
  [references/dispositions.md](references/dispositions.md). Output the
  one-line-per-PR report schema below, never prose — no writes.
- **Phase 2 — Approval (lead, one round).** Batch all escalations into one
  ask for the round — one short paragraph per PR: identity, diffstat, state,
  and the specific yes/no question. No diffs. Then issue per-repo execution
  orders pinned to `(PR number, head OID)` plus ordering constraints.
- **Phase 3 — Execute (workers).** Continue the *same worker* by message so it
  keeps its triage context. Per repo, serially: take a merge-budget slot,
  assert the head OID still matches, delegate `MERGE` to `/merge-pr`, and keep
  the slot reserved through Phase 5 CI validation. `FIX` items go to
  `/finalize-pr`, then back through triage in this round. `REVIVE`, `CLOSE`,
  and `HANDOFF` follow the evidence and ownership rules in
  [references/dispositions.md](references/dispositions.md).
- **Phase 4 — Verify and stage validation (lead).** Read back each action and
  record merge times, target bases, closed evidence, revive pushes, and
  acknowledged hand-offs. Keep every merged PR in the validation queue.
- **Phase 5 — Validate (lead).** Wait for post-merge CI on the base with an
  event-driven monitor and attribute every result by timestamp. On a git-flow
  repo whose `develop` is ahead of `main` after merges, run `/promote-release`;
  then run the repo's documented end-to-end or deploy check and move the
  consumer deployment file per the promotion follow-through contract. A merge
  is not counted done until these validations pass; route a failure to FIX or
  ESCALATE and keep the round active.
- **Phase 6 — Re-enter (lead).** Re-query open in-scope PRs and count those
  whose `createdAt` is older than 24 hours. At zero, emit the final report.
  Above zero, refresh the ownership ledger from fresh worker evidence, send at
  most one batched human ask, schedule the next round under the cadence rules,
  and continue the same workers.

The lead does exactly two blocking things: the Phase 2 approval round and the
Phase 4–6 closeout, including validation, the Phase 6 re-query, and scheduling.
Workers re-derive repo details; the lead does not.

## Classification

Every PR receives exactly one verdict. Rank up when unsure.

| Verdict | When | Action |
| --- | --- | --- |
| **MERGE** | Passes the canonical readiness gate, with low blast radius or approved escalation. | `/merge-pr`, then Phase 5. |
| **FIX** | One `/finalize-pr` away from the canonical gate. | Repair, then re-triage in the same round. |
| **REVIVE** | A local branch or worktree holds unpushed commits that complete the PR and no live session owns it. | Push only from a branch this session owns; then re-triage. |
| **CLOSE** (superseded / merged-elsewhere / obsolete / empty) | Positive evidence only: empty diff against base, every commit's patch-id already on base, a named merged PR supersedes it, or the change's target no longer exists. | Comment with evidence, close, then delete the remote branch and matching local branch/worktree through `/prune-branches`. |
| **HANDOFF(session)** | A live session owns the branch. | Message it and require acknowledgement; keep the PR tracked until closed. |
| **ESCALATE** | Human judgment or a gate is required. | Ask once per round in the batched escalation; keep the PR tracked. |

CLOSE never rests on age or "could not reproduce"; use the same positive
evidence bar as **issue-sweep** (github-workflows). A PR with a human "do not
close" or "do not merge" statement, or a review-gate label, is never closed or
merged by the sweep — ESCALATE it.

## Never auto-merge — escalate or hand off

- Draft, merge conflicts, or checks failing for a real (non-infrastructure)
  reason route to ESCALATE, unless a one-step repair qualifies as FIX.
- A promotion PR into a production branch routes to ESCALATE and
  `/promote-release`.
- Changes touching auth, secrets, migrations, permissions, or live infra route
  to ESCALATE; a human decides.
- An explicit human "do not merge", review-gate label, or prior human refusal
  routes to ESCALATE. The prior refusal outranks the sweep.
- A `/merge-pr` refusal routes to ESCALATE; carry its reason forward verbatim.
- A PR another session is actively working routes to HANDOFF.
- A merge gate requiring human approval the sweep cannot give routes to
  ESCALATE.

Every route has an owner, next action, and wake condition. Nothing ends in a
terminal hold.

## Report

```text
PR Sweep — <scope> — round <n>
  Merged:     <repo#N> — <title>
  Fixed+merged: <repo#N> — <what was repaired>
  Closed: <repo#N> — <evidence>
  Revived: <repo#N> — <branch>
  Handed off: <repo#N> → <session> (ack <timestamp>)
  Validated: <repo#N> — <CI / promotion / e2e result>
  Escalated:  <repo#N> — <question> → <decision>
  Repo findings: <broken base | repo-wide gate | infra failure>
  Open before → after: <b> → <a>
  Stale open (>24h) before → after: <b> → <a>
```

Emit the final report only when the fresh stale count is zero. Intermediate
rounds emit a round report plus the ownership ledger; they are not completion.
File follow-ups per the project's issue-routing convention.

## Mechanics

Diagnosis, parallel protocol, lazy state, schemas, cadence, ownership, and
disposition evidence: [references/sweep-mechanics.md](references/sweep-mechanics.md)
and [references/dispositions.md](references/dispositions.md).

## Related Skills

- **merge-pr** (github-workflows) — performs each merge and owns method resolution.
- **finalize-pr** (github-workflows) — drives one PR to mergeable; the `FIX` delegate.
- **resolve-pr-threads** (github-workflows) — resolves all PR feedback using the [feedback ledger](../gh-cli-patterns/references/pr-feedback-ledger.md).
- **gh-cli-patterns** (github-workflows) — canonical command shapes and queries.
- **promote-release** (github-workflows) — the promotion path.
- **prune-branches**, **refresh-repo** (github-workflows) — complementary cleanup.
