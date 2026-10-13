# Maintainer-specific delegation procedures

This reference contains the maintainer-specific executor roster, routing hook
policy, tracker choice, and local CLI procedure used by this plugin.

## Spawn and permission hooks

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

  Codex is Luna only, at `high`, `xhigh` or `max` only, and `xhigh` is the default. The code refuses any other
  Codex model or effort, and refuses to run Codex at all when no Luna model is listed, because `codex` would then
  use its configured default. Codex and `haiku` both classify at `xhigh`. Codex runs `workspace-write`
  (`read-only` for `Explore` and `Plan`). Roster spawns named `haiku-xhigh` or `opus-medium` go straight to Codex
  at `xhigh` or `max`, respectively, when available. Isolation, unavailable Codex, an empty Codex answer, or
  an explicit model, effort or name preserves the original spawn. Codex accepts only exact model slugs, so the plugin picks
  the listed Luna model with the lowest `priority` in Codex's own model cache. No version is written or parsed in
  the plugin.
- **Permission judge** (`tool.check` on `Bash`). Claude Code asks about a `bash -c` script that runs `rm` and
  cannot be checked, even under bypass mode. The judge sends the command to Luna at `xhigh`
  (`read-only`), or to `haiku` at `xhigh` without Codex. A `safe` verdict allows, an `unsafe` verdict denies with
  the reason, and any failure leaves the permission dialog.

The briefing rule for subagents ships in the `ai-llm-prompts` catalog, not in this plugin.

## Executor roster

Delegates come from this roster. The main session is the lead.

| Executor | Use for | Boundary |
| --- | --- | --- |
| Router (`fast-subagent`, `local-subagents`) | Lookups, bulk reads, classification, output reduction | Reports facts and evidence. Never writes code. |
| `haiku-xhigh` subagent | Scoped implementation, tests, bulk reads the router cannot take | Executes the plan. Does not change architecture or product intent. |
| `opus-medium` subagent | Architecture and security judgment, risky review | Advisory only. Never holds scope or completion. The lead decides. |
| Main session (lead) | Intent, architecture, decomposition, tradeoffs, risk, final review | Owns final decisions and user communication. |

Haiku effort is never below `high`; `opus-medium` defaults to `medium`. Full boundaries:
see [model-tiers.md](model-tiers.md).

**Delegate strictly downward — never spawn a peer at your own tier.** Send
quick lookups, exploration, and search to the **lowest** capable executor,
not just one down — that work costs volume, not thought. Roster: `haiku-xhigh`
and `opus-medium` only. Forks run on the lead's model; never fork from a Fable
session. Prefer the router for checkable, low-skill work; discover
availability live, never hard-code a physical model ID or a static
task-to-model table.

## Local Codex CLI executor

Before delegating, verify Codex is installed (`command -v codex`), signed in
(`codex login status`), and has quota: run `codex-quota`. Proceed only when it
exits 0, which means every window is under 95% used or has reset. Exit 1 means
quota is exhausted. Any other result means do not delegate.
Choose a supported model live with `/model` or `model/list`. For the cheap
family, effort is never below `high`:

```bash
codex exec --model "$CODEX_MODEL" -c "model_reasoning_effort=\"$CODEX_EFFORT\"" "$TASK"
```

## Repository fan-out

**Claude project route:** run one project thread per repository instead of the
local fan-out; see [the claude-projects rule](https://github.com/dryvist/ai-assistant-instructions/blob/develop/agentsmd/rules/on-demand/claude-projects.md).

## Shared doctrine prompt

Doctrine: `prompt://dryvist/auto-ai-agent/model-delegation`.

Hermes is the one caller with one wired as an automatic fallback, configured on
its own side — that does not extend to this skill's callers.

## Follow-up tracking

File follow-up work as a Vikunja task, never a GitHub issue.

- Create GitHub issues (file a Vikunja task instead)
