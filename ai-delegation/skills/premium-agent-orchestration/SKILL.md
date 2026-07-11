---
name: premium-agent-orchestration
description: This skill should be used when the active agent is Fable 5, Opus, or another expensive top-tier/SOTA model and the work should preserve premium reasoning for intent, architecture, decomposition, tradeoffs, final review, and synthesis while delegating checkable discovery, implementation, verification, logs, tests, and repetitive work to cheaper agents or local/free LLMs.
---

# Premium Agent Orchestration

Treat the active premium model as the senior decision-maker. Spend premium
reasoning only where stronger judgment changes the outcome, and route
checkable labor to the cheapest capable executor.

## Purpose

Use this skill to keep expensive top-tier models focused on judgment instead of
labor. Preserve premium reasoning for understanding intent, choosing strategy,
managing risk, resolving ambiguity, reviewing critical outputs, and giving the
final answer.

Delegate work when the result can be checked from concrete evidence. Prefer the
lowest-cost executor that can reliably produce that evidence.

## Senior Model Owns

Keep these decisions with the premium model:

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

## Delegation Tiers

Delegate work whose output can be verified from evidence.

| Tier | Use for | Boundary |
| --- | --- | --- |
| Local/free LLM | File discovery, log summaries, simple scans, checklist verification, cheap summaries | Report facts and evidence; avoid product or architecture calls |
| Haiku-class | Repo discovery, large-file summaries, log inspection, simple checks, edge-case scanning | Report facts, not direction |
| Sonnet-class | Scoped implementation, tests, medium debugging, local refactors, following existing patterns | Execute the plan; avoid changing architecture or product intent |
| Opus-class | Complex implementation, deep debugging, cross-module reasoning, risky review, security-sensitive reasoning | Reason deeply, but leave final authority with the premium lead |
| Premium lead | Intent, architecture, decomposition, tradeoffs, risk, disagreement, final review, synthesis | Own final decisions and user communication |

## Local And Free-Tier First

Before delegating routine labor to paid cloud models, look for local LLMs and
absolute cheapest free-tier model access available in the current environment.

Use local or free execution first for the lowest-skill tier when the task is
easy to verify. Good fits include file search summaries, log inspection,
test-output summaries, checklist verification, mechanical comparisons, and
other evidence-gathering tasks.

Prefer these routes in order for simple checkable work:

1. Local LLMs already reachable from the environment.
2. Absolute cheapest free-tier model access already configured for the session.
3. Cheap small-model agents.
4. More capable paid/cloud models only when cheaper routes lack context, tool
   access, reliability, or reasoning quality.

Discover current model availability live. Do not hard-code physical model IDs,
provider names, or static task-to-model tables. Use capability roles, local
registry data, or live model listing when available.

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

For high-risk work, keep the decision with the premium lead, use an Opus-class
agent for the hardest technical execution or review, and use cheaper agents or
local/free models to verify concrete evidence.

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

See the `subagent-resilience` rule (ai-assistant-instructions) for the full
contract.

## Operating Loop

1. Decide whether the task needs premium judgment.
2. Define observable success criteria.
3. Split checkable labor from judgment-heavy decisions.
4. Probe the spawn substrate before the first fan-out; pick the solo path if
   it fails.
5. Route checkable labor to the cheapest capable local, free, or small-model
   executor.
6. Use Sonnet-class agents for normal scoped engineering execution.
7. Use Opus-class agents for difficult delegated technical work or risky review.
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
