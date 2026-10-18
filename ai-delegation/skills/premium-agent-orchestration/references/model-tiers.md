# Model Tiers detail

Each row is an **executor**, named by agent type. Resolve each executor
against whatever the environment actually offers (native subagent types,
configured CLIs, local serving); never hard-code a vendor's lineup, including
for the premium lead itself.

| Executor | Use for | Boundary |
| --- | --- | --- |
| Router (`fast-subagent`, `local-subagents`) | File discovery, log and test-output summaries, simple scans, checklist verification, classification, bulk reads | Reports facts and evidence. Never writes code. Avoids product or architecture calls |
| Scoped implementation subagent | Scoped implementation, tests, medium debugging, local refactors, bulk reads the router cannot take, following existing patterns | Executes the plan. Avoids changing architecture or product intent |
| Advisory judgment subagent | Architecture and security judgment, deep debugging, cross-module reasoning, risky review | Advisory only. The lead decides. Never holds scope or completion |
| Main session (lead) | Intent, architecture, decomposition, tradeoffs, risk, disagreement, final review, synthesis | Owns final decisions and user communication |

For specified, checkable tasks, a fast model at high effort beats the
flagship. A scoped implementation subagent runs at high effort or above;
an advisory judgment subagent runs at medium effort.

## Model Tier Descent Rule (No Peer Spawning)

**Delegate strictly downward. Never spawn a peer at your own model tier.** A
subagent on the same model tier doesn't split judgment from labor — it just
moves the same authority sideways, at the same cost.

- Every delegation targets an executor below the delegator's own: the lead →
  an advisory judgment subagent or lower; an advisory judgment subagent → a
  scoped implementation subagent or lower; a scoped implementation subagent →
  the router, which executes directly.
- Send quick lookups, exploration, research, and web search — token-heavy,
  reasoning-light work — to the **lowest** capable model tier, not just one
  down. These tasks cost volume, not thought; paying a higher tier's rate
  for them is waste.
- "Same underlying model" means context isolation, not model-tier equality.
  An advisory delegate may share the lead's model weights while running in a
  fresh context with no path back to orchestrator authority, and it never
  holds scope, architecture, or completion calls; those stay with the lead.

## Backend choice

Choose the backend by the Delegation block in the core `AGENTS.md` (Codex first, then the ladder). Discover current
model availability live; never hard-code physical model IDs, provider names, or static task-to-model tables,
including for the premium lead itself.
