---
name: delegate-to-ai
description: Route a task to the right model — a native Claude subagent, Codex, or local MLX — based on task type
---

# Delegate to External AI

Picks the right executor when Claude-in-this-session is not the best tool:
native Claude subagents for implementation and planning, Codex for an
external/adversarial second opinion, and the shared router (see
`local-subagents`) for private, offline, or routine work.

## When to Delegate

- **Implementation / architecture / planning** -> native Claude subagent
  (`Plan` mode or the `Plan` / `general-purpose` subagent type). Claude is the
  best tool here — keep it in-house.
- **Adversarial review / external second opinion** -> Codex (the `codex` MCP
  tool or CLI). A genuinely different model catches what a Claude subagent won't.
- **Multiple independent perspectives / consensus** -> dispatch several native
  subagents in parallel (see the `superpowers:dispatching-parallel-agents`
  skill), optionally adding Codex as one of the voices. Synthesize the results
  yourself.
- **Private / offline / cheap / routine local task** -> the **local-subagents**
  skill (ai-delegation). Local MLX is still a real, available option here —
  it is reached through the shared router now, not by a direct call, so ask
  the router's live menu for the role that fits rather than assuming it is
  gone. That skill owns the live model menu, the call contract, and the
  failure modes for everything served through the router — this skill does
  not duplicate them.

## Route Selection

| Task type | Route | Executor |
| --- | --- | --- |
| Implementation | native subagent | `general-purpose` subagent |
| Architecture / planning | native subagent | `Plan` mode / `Plan` subagent |
| Adversarial review | external model | Codex (`codex` MCP) |
| Multi-perspective / consensus | parallel subagents | N native subagents (+ Codex) |
| Private / offline / cheap / routine local | shared router | `local-subagents` skill |

## Workflow

1. **Identify task type** (implementation, review, research, architecture,
   routine/local).
2. **Select route** from the table above.
3. **Execute**: native subagent via the Agent tool; Codex via its MCP tool;
   anything routine or local via the `local-subagents` skill.
4. **Synthesize** if you fanned out to multiple executors — you remain
   accountable for the final answer.

## Notes

- Cloud fan-out across many providers is not part of this skill — reach for
  Codex (OpenAI) or a dedicated tool when you need a specific external model.

## Related Skills

- **local-subagents** (ai-delegation) — the shared router: live menu, call
  contract, and failure modes.
- auto-maintain (ai-delegation)
- superpowers:dispatching-parallel-agents
