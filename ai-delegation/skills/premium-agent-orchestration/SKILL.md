---
name: premium-agent-orchestration
description: Use when the session runs a premium top-tier/SOTA model AND the work is independent pieces exceeding one context window, or a marathon multi-workstream coordination session. Fans work to scoped worker subagents or the local router while the lead keeps judgment, merging, and verification. Not for serial work with a few decisions or a single chain fitting one context — tune effort on one model instead.
---

# Premium Agent Orchestration

Treat the model running the current session as the senior decision-maker,
whatever it is — model- and vendor-agnostic. This skill is the
**orchestrator** case only: independent work that together exceeds one
context window, or a marathon multi-workstream coordination session.
**Not this skill:** serial work with a few
hard decisions, or one chain that fits a single context — tune effort on
one model instead. The baseline to beat is always the frontier model at
`high` effort alone; measure against that first.

## Economics

- **Pays** when combined input exceeds one context window.
- **Measured gains:** 47–55% cost cut on large-corpus work; on routine
  batches, half the average cost and a third of the worst-case (tail) cost
  versus one agent working serially.
- **Measured cost:** 10–12 accuracy points when workers are weaker than the
  lead. Mitigate by keeping merging and final judgment on the lead — never
  let a worker's output ship unreviewed.

## Senior Model Owns

The flagship keeps judgment on intent, design, tradeoffs, risk, and final
approval. The lead checks every result against its yes/no check and sends
failures back with the named shortfall; a delegate's claim isn't evidence.

**Delegate strictly downward — never spawn a peer at your own tier.** Send
quick lookups, exploration, and search to the **lowest** capable executor,
not just one down — that work costs volume, not thought. Forks run on the
lead's model. Prefer the router for checkable, low-skill work; discover
availability live, never hard-code a physical model ID or a static
task-to-model table.

## Concurrency and batching

- **Parallelize ready work.** Launch all independent, ready work in parallel;
  sequence only for real dependencies or same-file conflicts. Group related
  lookups within a worker when they form one task. Probe the spawn substrate
  before the first fan-out; if spawning fails, take the solo path.
  Never cap the number of workers. Gate a large fan-out only on measured machine
  load (CPU and memory under 80% of capacity); spawn failures and quota or rate
  limits are the other signals (see Substrate Resilience below). Batch many
  small related tasks into one Codex session as a task list.

## Worker output format

Workers return **one line or a schema**, never a prose report:

```text
STATUS | ITEM | REASON(<15 words)
```

`STATUS` is a short fixed vocabulary (`DONE`/`FAIL`/`BLOCKED`), `ITEM`
names what the line is about, `REASON` stays under 15 words. Use a JSON
schema instead when the lead needs structured fields to merge
programmatically. This measurably cuts output tokens with no accuracy loss
— a memo-style report costs several times as much for the same
information.

## Boundary and High-Risk Work

Delegate searching, reading, editing, testing, verifying. Keep intent,
design, tradeoffs, risk, disagreement, and final approval with the lead.
High-risk (auth, billing, permissions, security, migrations, data loss,
shared state, caching, concurrency, cross-module behavior, public APIs,
user-visible workflows): the lead decides. An advisory worker gives
architecture and security judgment. A scoped worker does the execution; the
router gathers evidence only.

## Substrate Resilience

Probe the spawn substrate, bound every poller, and take the solo path when
spawning fails. See the `subagent-resilience` rule
from your project's agent instructions.

## Sibling-prefix cache sharing

Where the executor supports prefix caching, parallel workers of the same
type share it only when the prefix is byte-identical: keep startup context
static, task-specific text **last** in the worker prompt. A varying opener
breaks the shared prefix and adds cold-start overhead.

## Plan Mode Versus Execution Mode

A "Plan mode is active" system notice, a plan file, or a request to design
before building means plan mode; anything else is execution. In plan mode,
for more than a quick single-step change, invoke the `goal` skill
(`ai-cli-harness-better-practices`) and put its output at the top of the
plan: objective, one boundary, numbered exit conditions each a reader-
runnable yes/no check, the last one end-to-end verification.

## Operating Loop

1. Confirm this is the orchestrator case (independent pieces exceeding one
   context, or a marathon multi-workstream coordination session) — otherwise,
   don't use this skill.
2. Make each delegated task atomic: one outcome, named inputs, a yes/no
   check, and a report file; keep sibling writes disjoint and sequence
   dependencies.
3. Probe the spawn substrate before the first fan-out; on failure, take the
   solo path.
4. Route lookups and bulk reads to the router, then a scoped worker subagent.
   Launch all independent, ready tasks in parallel; sequence real dependencies
   or same-file conflicts.
5. Use a scoped worker subagent for implementation. Use an advisory worker for architecture
   and security judgment only.
6. Require each worker's one-line or schema output (see above).
7. Answer the user briefly.

## Final Gate

Before answering, confirm the request was handled, required output formats
were used, non-trivial work was verified, and remaining risk is named.

## Related Skills

- delegate-to-ai (ai-delegation) for generic safeguards; delegation-ladder (jpe-ai-delegation) for the maintainer's own route
- auto-maintain (ai-delegation)
- local-subagents (ai-delegation) — cheap-first-escalate loop for a single
  chain of checkable work; this skill is the multi-worker fan-out case.
- goal (ai-cli-harness-better-practices)
