# ai-delegation

Claude Code plugin for delegating tasks to AI models, orchestrating premium-model work, and running autonomous maintenance loops.

Install: `/plugin install ai-delegation --marketplace JacobPEvans/claude-code-plugins`.

## Mods

The plugin carries a hooks module (`hooks/register.ts`) that runs in every session it is installed in.
Decisions append to `~/.claude/ai-delegation.log`.

- **Subagent router** (`tool.call` on `Agent`). A generic spawn (no `subagent_type`, `general-purpose`, `Explore`
  or `Plan`, with no model, effort or name set) is classified as `standard`, `complex`, `plan` or `deep`, and the
  lowest tier that fits runs it. When `codex` starts and `codex-quota` exits 0, Codex runs it and answers the call;
  otherwise the spawn is rewritten to a Claude model.

  | Class | Codex | Claude |
  | --- | --- | --- |
  | standard | Luna, `xhigh` | `haiku`, `xhigh` |
  | complex | Luna, `max` | `haiku`, `max` |
  | plan | never | `sonnet`, `high` |
  | deep | never | `opus`, `medium` |

  Codex is Luna only, at `high`, `xhigh` or `max` only. The code refuses any other Codex model or effort, and
  refuses to run Codex at all when no Luna model is listed, because `codex` would then use its configured
  default. Codex classifies at `high`; without Codex, `haiku` at `high` classifies. Codex runs `workspace-write`
  (`read-only` for `Explore` and `Plan`). A spawn with `isolation` stays on Claude. A named roster agent such as
  `haiku-xhigh` is an explicit choice and passes through. The newest listed Luna model comes from Codex's own
  model cache, so no version is written in the plugin.
- **Permission judge** (`tool.check` on `Bash`). Claude Code asks about a `bash -c` script that runs `rm` and
  cannot be checked, even under bypass mode. The judge sends the command to Luna at `xhigh`
  (`read-only`), or to `haiku` at `xhigh` without Codex. A `safe` verdict allows, an `unsafe` verdict denies with
  the reason, and any failure leaves the permission dialog.

The briefing rule for subagents ships in the `ai-llm-prompts` catalog, not in this plugin.

## Skills

- **`/delegate-to-ai`** - Route implementation to Codex (after `codex-quota`), else `haiku-xhigh`; ZCode only when the operator names it
- **`/auto-maintain`** - Autonomous maintenance orchestrator that continuously finds and dispatches work
- **`/premium-agent-orchestration`** - Preserve top-tier/SOTA model reasoning (any vendor,
  current or future — the session's own model is assumed to be the premium lead)
  for judgment while delegating checkable work to cheaper agents, local LLMs, or free tiers
- **`/local-subagents`** - Hand bulk reading, summarizing, classifying, extracting,
  boilerplate and first-pass code reads to a locally served or cheap model through the
  shared router: when to delegate, how to read the live menu (speed, quality, best-for,
  context, price) from the router's own contract, how to bound the call, and what to do
  when the router says no
- **`/fast-subagent`** - One command that sends a routine, checkable step to the
  router's fast-subagent role (`fast`, alias `subagent`) and keeps sending every such
  step all session long; the router owns which backend answers and the fallback order,
  so a re-ranking never needs a redeploy
- **`/openrouter-models`** - Choose among hosted models by current price and context length
  from the public catalog, self-enforce a daily spend budget the router does not meter,
  and respect the free-tier prompt-logging caveat
- **`/multi-model-review`** - Fan a plan or diff out to independent model families
  (a cloud coding-agent CLI, a cloud reasoning-agent CLI, a local model server) for
  adversarial review, plus the gotcha each invocation type hits

`delegate-to-ai` is shared by Claude Code and Codex, with one ZCode eligibility and verification procedure.
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
/delegate-to-ai
/auto-maintain
/premium-agent-orchestration
/local-subagents
/fast-subagent
/openrouter-models
/multi-model-review
```

## License

MIT
