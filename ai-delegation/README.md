# ai-delegation

Claude Code plugin for delegating tasks to AI models, orchestrating premium-model work, and running autonomous maintenance loops.

## Skills

- **`/delegate-to-ai`** - Route a task to the right model (native subagent, Codex, or local MLX) based on task type
- **`/auto-maintain`** - Autonomous maintenance orchestrator that continuously finds and dispatches work
- **`/premium-agent-orchestration`** - Preserve top-tier/SOTA model reasoning (any vendor,
  current or future — the session's own model is assumed to be the premium lead)
  for judgment while delegating checkable work to cheaper agents, local LLMs, or free tiers
- **`/delegate-to-router`** - Offload a bounded subtask to a shared OpenAI-compatible
  model router: discover the live model menu from the router's own contract, pick the
  cheapest capable tier, bound the call, and report failures instead of falling back silently
- **`/openrouter-models`** - Choose among hosted models by current price and context length
  from the public catalog, self-enforce a daily spend budget the router does not meter,
  and respect the free-tier prompt-logging caveat

`delegate-to-router` and `openrouter-models` are written to be harness-agnostic: they
use only shell, `curl`, and `jq`, name no model ids, and read their endpoint from the
environment. Non-Claude harnesses consume them straight from this repository rather than
keeping a second authored copy, so the spend and egress rules cannot drift between them.

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/ai-delegation
```

## Usage

```text
/delegate-to-ai
/auto-maintain
/premium-agent-orchestration
/delegate-to-router
/openrouter-models
```

## License

MIT
