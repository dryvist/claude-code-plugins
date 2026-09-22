# Model Tiers detail

Each row is a **capability role**, not a specific model name. Resolve each
tier against whatever the environment actually offers (native subagent
model options, configured CLIs, local serving); never hard-code a vendor's
lineup, including for the premium lead itself.

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
  lead → strong reasoning or lower; strong reasoning → mid execution or
  lower; and so on down to local/free, which executes directly.
- Send quick lookups, exploration, research, and web search — token-heavy,
  reasoning-light work — to the **lowest** capable model tier, not just one
  down. These tasks cost volume, not thought; paying a higher tier's rate
  for them is waste.
- "Same underlying model" means context isolation, not model-tier equality.
  A strong-reasoning delegate may share weights with the premium lead only
  as a bounded executor in a fresh context, with no path back to
  orchestrator authority. It stays one model tier down in role — it never
  regains scope, architecture, or completion calls; those stay with the
  premium lead.

## Local And Free-Tier First

Before delegating routine labor to paid cloud models, look for local LLMs
and absolute cheapest free-tier model access available in the current
environment.

Use local or free execution first for the lowest-skill tier when the task
is easy to verify. Good fits include file search summaries, log
inspection, test-output summaries, checklist verification, mechanical
comparisons, and other evidence-gathering tasks.

Subagent cache-creation was measured at 35% of all cache writes for 9% of
output, so every reading or mechanical subagent must carry an explicit
lower `model:` and report to a file rather than back into the lead's
context.

Prefer these routes in order for simple checkable work:

1. Local LLMs already reachable from the environment.
2. Absolute cheapest free-tier model access already configured for the
   session.
3. Cheap small-model agents.
4. More capable paid/cloud models only when cheaper routes lack context,
   tool access, reliability, or reasoning quality.

Discover current model availability live. Do not hard-code physical model
IDs, provider names, or static task-to-model tables — including for the
premium lead itself. Use capability roles, local registry data, or live
model listing when available.
