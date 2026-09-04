---
name: premium-agent-orchestration
description: Use when the session runs a premium top-tier/SOTA model (any vendor, current or future — the session's model IS the premium lead). Keeps premium reasoning on judgment (intent, architecture, tradeoffs, final review) and delegates checkable labor to cheaper agents or local/free LLMs.
---

# Premium Agent Orchestration

Treat the model running the current session as the senior decision-maker,
whatever it is — the skill is model- and vendor-agnostic and applies equally
to any present or future top-tier model. Spend premium reasoning only where
stronger judgment changes the outcome, and route checkable labor to the
cheapest capable executor.

## Purpose

Use this skill to keep expensive top-tier models focused on judgment instead of
labor. Preserve premium reasoning for understanding intent, choosing strategy,
managing risk, resolving ambiguity, reviewing critical outputs, and giving the
final answer.

Delegate work when the result can be checked from concrete evidence. Prefer the
lowest-cost executor that can reliably produce that evidence.

## Senior Model Owns

Keep these decisions with the premium lead (the current session's model):

- Understand the real user intent.
- Decide what matters and what is out of scope.
- Choose the architecture or approach.
- Break ambiguous work into clear parts.
- Decide task order and dependencies.
- Make tradeoffs between speed, quality, risk, and scope.
- Identify hidden risks.
- Resolve disagreement between agents.
- Review important outputs.
- Decide when the work is good enough.
- Give the final answer to the user.

## Model Tiers

Each row below is a **model tier** — a capability role, not a specific model
name. Resolve each tier against whatever models the current environment
actually offers (native subagent model options, configured CLIs, local
serving); never assume a specific vendor's lineup.

| Tier | Use for | Boundary |
| --- | --- | --- |
| Local/free | File discovery, log summaries, simple scans, checklist verification, cheap summaries | Report facts and evidence; avoid product or architecture calls |
| Small/cheap cloud | Repo discovery, large-file summaries, log inspection, simple checks, edge-case scanning | Report facts, not direction |
| Mid execution | Scoped implementation, tests, medium debugging, local refactors, following existing patterns | Execute the plan; avoid changing architecture or product intent |
| Strong reasoning | Complex implementation, deep debugging, cross-module reasoning, risky review, security-sensitive reasoning | Reason deeply, but leave final authority with the premium lead |
| Premium lead | Intent, architecture, decomposition, tradeoffs, risk, disagreement, final review, synthesis | Own final decisions and user communication |

The table runs highest model tier (Premium lead) to lowest (Local/free).

## Model Tier Descent Rule (No Peer Spawning)

**Delegate strictly downward. Never spawn a peer at your own model tier.** A
subagent on the same model tier doesn't split judgment from labor — it just
moves the same authority sideways, at the same cost.

- Every delegation targets a model tier below the delegator's own: premium
  lead → strong reasoning or lower; strong reasoning → mid execution or lower;
  and so on down to local/free, which executes directly.
- Send quick lookups, exploration, research, and web search — token-heavy,
  reasoning-light work — to the **lowest** capable model tier (see "Local And
  Free-Tier First" below), not just one down. These tasks cost volume, not
  thought; paying a higher tier's rate for them is waste.
- "Same underlying model" means context isolation, not model-tier equality. A
  strong-reasoning delegate may share weights with the premium lead only as a
  bounded executor in a fresh context, with no path back to orchestrator
  authority. It stays one model tier down in role — it never regains scope,
  architecture, or completion calls; those stay with the premium lead (see
  "Senior Model Owns").

## Local And Free-Tier First

Before delegating routine labor to paid cloud models, look for local LLMs and
absolute cheapest free-tier model access available in the current environment.

Use local or free execution first for the lowest-skill tier when the task is
easy to verify. Good fits include file search summaries, log inspection,
test-output summaries, checklist verification, mechanical comparisons, and
other evidence-gathering tasks.

Subagent cache-creation was measured at 35% of all cache writes for 9% of
output, so every reading or mechanical subagent must carry an explicit lower
`model:` and report to a file rather than back into the lead's context.

Prefer these routes in order for simple checkable work:

1. Local LLMs already reachable from the environment.
2. Absolute cheapest free-tier model access already configured for the session.
3. Cheap small-model agents.
4. More capable paid/cloud models only when cheaper routes lack context, tool
   access, reliability, or reasoning quality.

Discover current model availability live. Do not hard-code physical model IDs,
provider names, or static task-to-model tables — including for the premium
lead itself. Use capability roles, local registry data, or live model listing
when available.

## Boundary

Do the work directly only when delegation would cost more than doing the task,
or when the task requires senior judgment.

Delegate the task when it is mostly searching, reading, editing, testing, or
verifying.

Keep the task with the premium lead when it involves intent, design, tradeoffs,
risk, disagreement, or final approval.

## High-Risk Work

Treat these areas as high-risk:

- Auth.
- Billing.
- Permissions.
- Security.
- Migrations.
- Data loss.
- Shared state.
- Caching.
- Concurrency.
- Cross-module behavior.
- Public APIs.
- User-visible workflows.

For high-risk work, keep the decision with the premium lead, use a
strong-reasoning agent for the hardest technical execution or review, and use
cheaper agents or local/free models to verify concrete evidence.

## Substrate Resilience (solo fallback is mandatory)

The spawn substrate (agent supervisor, tmux panes, `fork()`) is
infrastructure and fails in practice (observed: mid-run ENXIO fork failures
and a phantom spawn that returned an id but no output). Every delegation plan
must survive losing it:

- Probe before a fan-out: spawn one trivial agent and confirm real output.
- Bound concurrency; never fire an unbounded batch.
- Treat "id returned but no output by a sane deadline" as a failed spawn.
- Declare the solo path: which steps the lead executes single-threaded when
  spawning is unavailable. Degrade to serial — never abort the mission or
  restart shared infrastructure that would kill the lead session mid-run.
- On spawn failure, re-probe with backoff; do not retry-loop spawns.
- Arm a recurring heartbeat (cron/monitor) re-invoking the lead every ~30 min
  (your call, never over 50 min — the prompt-cache ceiling). Each firing:
  check which executors owe reports, ground-truth-verify anything silent
  >45 min (silence isn't progress — watchers die silently, e.g. credential
  expiry), advance the critical path.
- Every subagent waiter/poller needs a bounded timeout (~30 min default, your
  call); on expiry it surfaces state to the lead instead of waiting longer.
  Poll loops re-mint short-lived credentials per attempt, never held across
  waits.

See the `subagent-resilience` rule (ai-assistant-instructions) for the full
contract.

## Ensemble Mode (opt-in)

Use when the solution space is genuinely wide and one attempt would anchor the
answer: architecture choices, API or schema design, naming, a tricky algorithm,
a rewrite with several defensible shapes. **Not the default** — for work with one
obvious shape, a single delegate plus review is cheaper and just as good, and the
returns past three attempts are not worth the spend.

Ensemble is still a downward delegation: the lead never competes in its own
ensemble, and the winner is chosen by the lead, not voted on by the executors.

### 1. Diversify the prompts

Three executors, three *deliberately different* instructions. Identical prompts
produce correlated answers and buy nothing. Pick the axis by task type:

| Task type | Axis | The three prompts |
| --- | --- | --- |
| Code generation | Constraint | optimize for **simplicity** / for **performance** / for **extensibility** |
| Architecture, design | Approach | **top-down** (requirements → interfaces) / **bottom-up** (primitives → composition) / **lateral** (analogy from another domain) |
| Creative, naming, docs | Persona | **expert** (precise, conventional) / **pragmatic** (ship-focused, explicit tradeoffs) / **innovative** (challenges the assumptions) |

Each prompt carries the full task context, its own optimization focus, the
constraints specific to that approach, and the expected output format.

Tier assignment follows the existing table — architecture and design go to the
strong-reasoning tier, code generation and creative work to the mid-execution
tier. Resolve those tiers live; **never name a specific model** (see "Local And
Free-Tier First").

### 2. Score the results

Read every result against a fixed rubric so the choice is evidence, not taste.
Baseline weights, adjusted per task type:

| Criterion | Base | Code generation | Architecture | Creative |
| --- | --- | --- | --- | --- |
| Correctness | 30% | 35% | 25% | 20% |
| Completeness | 20% | 20% | 25% | 20% |
| Quality | 20% | 20% | 20% | 20% |
| Clarity | 15% | 15% | 15% | 15% |
| Elegance | 15% | 10% | 10% | 25% |
| *(added)* | — | Testability 10% | Flexibility 10% | Originality 10% |

Score 1–10: 9–10 production-ready, 7–8 minor polish, 5–6 needs work, 3–4
significant issues, 1–2 fundamentally wrong.

### 3. Select and report

Present the **full** winning result — not a summary — then the score table, two
or three sentences on the actual differentiator, and one line per runner-up
saying when it *would* have been the right pick. Graft a clearly better idea from
a runner-up into the winner rather than discarding it.

If an executor dies, score what came back and say how many ran; the substrate
rules above already cover degrading to serial or solo.

*Diversification strategies and the scoring rubric adapted from the
`ensemble-orchestrator` agent in [mhattingpete/claude-skills-marketplace](https://github.com/mhattingpete/claude-skills-marketplace)
(Apache-2.0), rewritten in capability-tier terms.*

## Operating Loop

1. Decide whether the task needs premium judgment.
2. Define observable success criteria.
3. Split checkable labor from judgment-heavy decisions.
4. Probe the spawn substrate before the first fan-out; if it fails, take the
   solo path — the lead executes steps 5-7's work serially itself.
5. Route checkable labor to the cheapest capable local, free, or small-model
   executor.
6. Use mid-execution-tier agents for normal scoped engineering execution.
7. Use strong-reasoning agents for difficult delegated technical work or risky
   review. When the solution space is wide rather than merely hard, run
   Ensemble Mode instead of a single delegate.
8. Review each agent's evidence.
9. Make the important decision with the premium lead.
10. Verify non-trivial work before answering.
11. Answer the user briefly.

## Final Gate

Before answering, confirm:

- The real request was handled.
- Premium reasoning was used only where it mattered.
- Delegated work came with evidence.
- Non-trivial work was verified.
- Remaining risk is clear.

Final responses should mention only what was done or decided, what verification
passed or failed, and any important remaining risk.

## Related Skills

- delegate-to-ai (ai-delegation)
- auto-maintain (ai-delegation)
