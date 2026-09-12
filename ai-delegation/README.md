# ai-delegation

Claude Code plugin for delegating tasks to AI models, orchestrating premium-model work, and running autonomous maintenance loops.

## Skills

- **`/delegate-to-ai`** - Route a task to the right model (native subagent, Codex, or local MLX) based on task type
- **`/auto-maintain`** - Autonomous maintenance orchestrator that continuously finds and dispatches work
- **`/premium-agent-orchestration`** - Preserve top-tier/SOTA model reasoning (any vendor,
  current or future — the session's own model is assumed to be the premium lead)
  for judgment while delegating checkable work to cheaper agents, local LLMs, or free tiers
- **`/local-subagents`** - Hand bulk reading, summarizing, classifying, extracting,
  boilerplate and first-pass code reads to a locally served or cheap model through the
  shared router: when to delegate, how to read the live menu (speed, quality, best-for,
  context, price) from the router's own contract, how to bound the call, and what to do
  when the router says no
- **`/openrouter-models`** - Choose among hosted models by current price and context length
  from the public catalog, self-enforce a daily spend budget the router does not meter,
  and respect the free-tier prompt-logging caveat
- **`/multi-model-review`** - Fan a plan or diff out to independent model families
  (a cloud coding-agent CLI, a cloud reasoning-agent CLI, a local model server) for
  adversarial review, plus the gotcha each invocation type hits

`local-subagents` and `openrouter-models` are written to be harness-agnostic: they
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
/local-subagents
/openrouter-models
/multi-model-review
```

## License

MIT
