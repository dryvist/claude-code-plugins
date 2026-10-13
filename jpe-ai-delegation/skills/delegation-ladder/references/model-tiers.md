# Model Tiers detail

Each row is an **executor**, named by agent type. Resolve each executor
against whatever the environment actually offers (native subagent types,
configured CLIs, local serving); never hard-code a vendor's lineup, including
for the premium lead itself.

| Executor | Use for | Boundary |
| --- | --- | --- |
| Router (`fast-subagent`, `local-subagents`) | File discovery, log and test-output summaries, simple scans, checklist verification, classification, bulk reads | Reports facts and evidence. Never writes code. Avoids product or architecture calls |
| `haiku-xhigh` subagent | Scoped implementation, tests, medium debugging, local refactors, bulk reads the router cannot take, following existing patterns | Executes the plan. Avoids changing architecture or product intent |
| `opus-medium` subagent | Architecture and security judgment, deep debugging, cross-module reasoning, risky review | Advisory only. The lead decides. Never holds scope or completion |
| Main session (lead) | Intent, architecture, decomposition, tradeoffs, risk, disagreement, final review, synthesis | Owns final decisions and user communication |

For specified, checkable tasks, a fast model at high effort beats the
flagship. `haiku-xhigh` runs at `xhigh` and is never set below `high`;
`opus-medium` runs at `medium`.

## Model Tier Descent Rule (No Peer Spawning)

**Delegate strictly downward. Never spawn a peer at your own model tier.** A
subagent on the same model tier doesn't split judgment from labor — it just
moves the same authority sideways, at the same cost.

- Every delegation targets an executor below the delegator's own: the lead →
  `opus-medium` or lower; `opus-medium` → `haiku-xhigh` or lower; `haiku-xhigh` →
  the router, which executes directly.
- Send quick lookups, exploration, research, and web search — token-heavy,
  reasoning-light work — to the **lowest** capable model tier, not just one
  down. These tasks cost volume, not thought; paying a higher tier's rate
  for them is waste.
- "Same underlying model" means context isolation, not model-tier equality.
  `opus-medium` is a same-weights advisory delegate when the lead is Opus. It
  runs in a fresh context with no path back to orchestrator authority, and it
  never holds scope, architecture, or completion calls; those stay with the
  lead.

## Local And Free-Tier First

Before delegating routine labor to paid cloud models, look for local LLMs
and absolute cheapest free-tier model access available in the current
environment.

Use local or free execution first for the lowest-skill tier when the task
is easy to verify. Good fits include file search summaries, log
inspection, test-output summaries, checklist verification, mechanical
comparisons, and other evidence-gathering tasks.

Prefer these routes in order for lookups and bulk reads:

1. Local LLMs already reachable from the environment.
2. Absolute cheapest free-tier model access already configured for the
   session.
3. `haiku-xhigh`, only when the router lacks context, tool access,
   reliability, or reasoning quality for the step.

Discover current model availability live. Do not hard-code physical model
IDs, provider names, or static task-to-model tables — including for the
premium lead itself. Use capability roles, local registry data, or live
model listing when available.
