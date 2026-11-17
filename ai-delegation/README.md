# ai-delegation

Claude Code plugin for delegating tasks to AI models, orchestrating premium-model work, and running autonomous maintenance loops.

Install: `/plugin install ai-delegation --marketplace JacobPEvans/claude-code-plugins`.

## Maintainer-specific route

The executor route, eligibility rules, and routing hook for the maintainer's own setup ship in
`/delegation-ladder` from `jpe-ai-delegation`.

## Skills

- **`/premium-agent-orchestration`** - Reset to lean orchestrator mode: runs `/agentops:orchestrate`
  for dispatch and adds the cheapest-capable ladder, the decisions the parent keeps, and fleet upkeep
- **`/local-subagents`** - Hand bulk reading, summarizing, classifying, extracting,
  boilerplate and first-pass code reads to a locally served or cheap model through the
  shared router: when to delegate, how to read the live menu (speed, quality, best-for,
  context, price) from the router's own contract, how to bound the call, and what to do
  when the router says no
- **`/fast-subagent`** - One command that sends a routine, checkable step to the
  router's fast-subagent role (capabilities `small` and `medium`) and keeps sending every such
  step all session long; the router owns which backend answers and the fallback order,
  so a re-ranking never needs a redeploy
- **`/openrouter-models`** - Choose among hosted models by current price and context length
  from the public catalog, self-enforce a daily spend budget the router does not meter,
  and respect the free-tier prompt-logging caveat
- **`/delegate-to-ai`**, **`/auto-maintain`**, **`/multi-model-review`** - Superseded shims that
  point to `/agentops:orchestrate`, `/agentops:navigate` and `/agentops:council`

`local-subagents`, `fast-subagent` and `openrouter-models` are written to be harness-agnostic: they
use only shell, `curl`, and `jq`, name no model ids, and read their endpoint from the
environment. Non-Claude harnesses consume them straight from this repository rather than
keeping a second authored copy, so the spend and egress rules cannot drift between them.

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/ai-delegation
```

## Usage

```text
/premium-agent-orchestration
/local-subagents
/fast-subagent
/openrouter-models
```

## License

MIT
