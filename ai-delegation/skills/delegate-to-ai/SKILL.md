---
name: delegate-to-ai
description: Route a task to the right model — a native Claude subagent, Codex, or local MLX — based on task type
---

# Delegate to External AI

Picks the right executor when Claude-in-this-session is not the best tool:
native Claude subagents for implementation and planning, Codex for an
external/adversarial second opinion, and local MLX for private or offline work.

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
- **Private / offline / cheap local task** -> local MLX via llama-swap (below).
  No prompt leaves the machine.

## Local MLX — direct call

Local models are named by **capability role**, not physical id. Roles resolve to
the resident model via the ai-stack registry
(`~/.config/ai-stack/registry.json`, written by nix-ai); never hardcode a
physical model id — when the resident model changes, only the registry changes.

Call llama-swap directly (OpenAI-compatible, no gateway hop):

```bash
curl -s http://127.0.0.1:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"default","messages":[{"role":"user","content":"..."}]}'
```

Roles: `default`, `quickest`, `coding`, `tool-calling`, `large-context`,
`most-capable`, `oss`. Pick the role that fits the task; the registry maps it to
the physical model.

## Route Selection

| Task type | Route | Executor |
| --- | --- | --- |
| Implementation | native subagent | `general-purpose` subagent |
| Architecture / planning | native subagent | `Plan` mode / `Plan` subagent |
| Adversarial review | external model | Codex (`codex` MCP) |
| Multi-perspective / consensus | parallel subagents | N native subagents (+ Codex) |
| Private / offline / quick local | local MLX | llama-swap `:11434`, capability role |

## Workflow

1. **Identify task type** (implementation, review, research, architecture).
2. **Select route** from the table above.
3. **Execute**: native subagent via the Agent tool; Codex via its MCP tool;
   local MLX via `curl`/Bash to `:11434`.
4. **Synthesize** if you fanned out to multiple executors — you remain
   accountable for the final answer.

## Notes

- There is no local multi-provider gateway. The Bifrost gateway now runs on the
  Proxmox homelab; this skill does not route through it.
- Cloud fan-out across many providers is not part of this skill — reach for
  Codex (OpenAI) or a dedicated tool when you need a specific external model.

## Related Skills

- auto-maintain (ai-delegation)
- superpowers:dispatching-parallel-agents
