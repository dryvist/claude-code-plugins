---
name: premium-agent-orchestration
description: Use when the session runs a premium top-tier/SOTA model AND the work is independent pieces exceeding one context window, or a marathon multi-workstream coordination session. Fans work to haiku-xhigh or the local router while the lead keeps judgment, merging, and verification. Not for serial work with a few decisions or a single chain fitting one context — tune effort on one model instead.
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

## Roster

Delegates come from this roster. The main session is the lead.

| Executor | Use for | Boundary |
| --- | --- | --- |
| Router (`fast-subagent`, `local-subagents`) | Lookups, bulk reads, classification, output reduction | Reports facts and evidence. Never writes code. |
| `haiku-xhigh` subagent | Scoped implementation, tests, bulk reads the router cannot take | Executes the plan. Does not change architecture or product intent. |
| `opus-medium` subagent | Architecture and security judgment, risky review | Advisory only. Never holds scope or completion. The lead decides. |
| Main session (lead) | Intent, architecture, decomposition, tradeoffs, risk, final review | Owns final decisions and user communication. |

Haiku effort is never below `high`; `opus-medium` defaults to `medium`. Full boundaries:
`references/model-tiers.md`.

**Delegate strictly downward — never spawn a peer at your own tier.** Send
quick lookups, exploration, and search to the **lowest** capable executor,
not just one down — that work costs volume, not thought. Roster: `haiku-xhigh`
and `opus-medium` only. Forks run on the lead's model; never fork from a Fable
session. Prefer the router for checkable, low-skill work; discover
availability live, never hard-code a physical model ID or a static
task-to-model table.

## Local Codex CLI executor

Before delegating, verify Codex is installed (`command -v codex`), signed in
(`codex login status`), and has quota: run `codex-quota`. Proceed only when it
exits 0, which means every window is under 95% used or has reset. Exit 1 means
quota is exhausted. Any other result means do not delegate.
Choose a supported model live with `/model` or `model/list`. For the cheap
family, effort is never below `high`:

```bash
codex exec --model "$CODEX_MODEL" -c "model_reasoning_effort=\"$CODEX_EFFORT\"" "$TASK"
```

## Concurrency and batching

- **Cap: 4 concurrent workers.** Override explicitly, and say why,
  when a task genuinely needs more or the substrate can't sustain that many.
- **Batch related lookups into one worker** rather than spawning N workers
  each paying its own startup overhead. A worker that reads five related
  files avoids the overhead of five workers that each read one.
- Probe the spawn substrate before the first fan-out (see Substrate
  Resilience below) — the cap only matters once spawning actually works.

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
user-visible workflows): the lead decides. `opus-medium` gives advisory
architecture and security judgment. `haiku-xhigh` does the execution; the
router gathers evidence only.

## Substrate Resilience

Probe the spawn substrate, cap workers, bound every poller, and take the solo
path when spawning fails. See the `subagent-resilience` rule
(ai-assistant-instructions).

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
4. Route lookups and bulk reads to the router, then `haiku-xhigh`. Batch them
   per worker. Cap concurrency at 4 unless you state an explicit override.
5. Use `haiku-xhigh` for scoped implementation. Use `opus-medium` for architecture
   and security judgment only.
6. Require each worker's one-line or schema output (see above).
7. Answer the user briefly.

## Final Gate

Before answering, confirm the request was handled, required output formats
were used, non-trivial work was verified, and remaining risk is named.

## Related Skills

- delegate-to-ai (ai-delegation)
- auto-maintain (ai-delegation)
- local-subagents (ai-delegation) — cheap-first-escalate loop for a single
  chain of checkable work; this skill is the multi-worker fan-out case.
- goal (ai-cli-harness-better-practices)
