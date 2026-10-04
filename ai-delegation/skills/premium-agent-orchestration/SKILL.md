---
name: premium-agent-orchestration
description: Use when the session runs a premium top-tier/SOTA model AND the work is independent pieces exceeding one context window, or insurance against an occasional runaway task in a large routine batch. Fans work to cheaper agents or local/free LLMs while the lead keeps judgment, merging, and verification. Not for serial work with a few decisions or a single chain fitting one context — tune effort on one model instead.
---

# Premium Agent Orchestration

Treat the model running the current session as the senior decision-maker,
whatever it is — model- and vendor-agnostic. This skill is the
**orchestrator** case only: independent work that together exceeds one
context window, or a large routine batch where one delegate guards against
an occasional runaway task. **Not this skill:** serial work with a few
hard decisions, or one chain that fits a single context — tune effort on
one model instead. The baseline to beat is always the frontier model at
`low` effort alone; measure against that first.

## Economics

- **Pays** when combined input exceeds one context window, or as insurance
  against a runaway task in a large routine batch.
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

## Model Tiers

Five capability roles, never vendor or model names, lowest to highest:
**local/free** (facts and
evidence only) → **small/cheap cloud** (facts, not direction) → **mid
execution** (scoped implementation, following existing patterns) →
**strong reasoning** (complex work, risky review, no final authority) →
**premium lead** (owns final decisions). Full per-tier task examples and
boundaries: `references/model-tiers.md`.

**Delegate strictly downward — never spawn a peer at your own tier.** Send
quick lookups, exploration, and search to the **lowest** capable tier, not
just one down — that work costs volume, not thought. A same-weights
delegate in a fresh context is still one tier down in role and never
regains orchestrator authority. Prefer local/free for checkable, low-skill
work; discover availability live, never hard-code a physical model ID or a
static task-to-model table.

## Local Codex CLI executor

Before delegating, verify Codex is installed (`command -v codex`), signed in
(`codex login status`), and has quota remaining via `/status` or app-server
[`account/rateLimits/read`](https://developers.openai.com/codex/app-server/);
unknown or exhausted usage means do not delegate.
Choose a supported model and effort live with `/model` or `model/list`:

```bash
codex exec --model "$CODEX_MODEL" -c "model_reasoning_effort=\"$CODEX_EFFORT\"" "$TASK"
```

## Concurrency and batching

- **Default cap: 4–6 concurrent workers.** Override explicitly, and say why,
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
information. Exception: Ensemble Mode's winning result is presented in
full by design (`references/ensemble-mode.md`).

## Boundary and High-Risk Work

Delegate searching, reading, editing, testing, verifying. Keep intent,
design, tradeoffs, risk, disagreement, and final approval with the lead.
High-risk (auth, billing, permissions, security, migrations, data loss,
shared state, caching, concurrency, cross-module behavior, public APIs,
user-visible workflows): the lead decides, strong-reasoning does the
hardest execution/review, cheaper agents verify evidence only.

## Substrate Resilience (solo fallback is mandatory)

The spawn substrate (agent supervisor, tmux panes, `fork()`) is
infrastructure and fails in practice. Every delegation plan must survive
losing it:

- Probe before a fan-out: spawn one trivial agent and confirm real output.
- Bound concurrency to the cap above; never fire an unbounded batch.
- Treat "id returned but no output by a sane deadline" as a failed spawn,
  and declare a solo path — which steps the lead runs single-threaded when
  spawning is unavailable. Degrade to serial; never abort the mission or
  restart shared infrastructure that would kill the lead session mid-run.
- Every waiter/poller needs a bounded timeout (~30 min default); on expiry
  it surfaces state to the lead instead of waiting longer.

Full contract (heartbeat cadence, credential re-minting, required-check
naming): `references/substrate-resilience.md` and the `subagent-resilience`
rule (ai-assistant-instructions).

## Sibling-prefix cache sharing

Where the executor supports prefix caching, parallel workers of the same
type share it only when the prefix is byte-identical: keep startup context
static, task-specific text **last** in the worker prompt. A varying opener
breaks the shared prefix and adds cold-start overhead.

## Ensemble Mode (opt-in, wide solution space only)

Use only when the solution space is genuinely wide and one attempt would
anchor the answer — architecture choices, schema design, naming, a rewrite
with several defensible shapes. Not the default. Full diversification
strategy and scoring rubric: `references/ensemble-mode.md`.

## Plan Mode Versus Execution Mode

A "Plan mode is active" system notice, a plan file, or a request to design
before building means plan mode; anything else is execution. In plan mode,
for more than a quick single-step change, invoke the `goal` skill
(`ai-cli-harness-better-practices`) and put its output at the top of the
plan: objective, one boundary, numbered exit conditions each a reader-
runnable yes/no check, the last one end-to-end verification.

## Operating Loop

1. Confirm this is the orchestrator case (independent pieces exceeding one
   context, or tail insurance on a large routine batch) — otherwise, don't
   use this skill.
2. Make each delegated task atomic: one outcome, named inputs, a yes/no
   check, and a report file; keep sibling writes disjoint and sequence
   dependencies.
3. Probe the spawn substrate before the first fan-out; on failure, take the
   solo path.
4. Route checkable labor to the cheapest capable tier, batched per worker.
   Cap concurrency at 4–6 unless you state an explicit override.
5. Use mid-execution agents for scoped implementation, strong-reasoning
   agents for hard delegated work or risky review.
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
