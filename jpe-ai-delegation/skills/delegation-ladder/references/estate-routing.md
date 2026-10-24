# Maintainer-specific delegation procedures

`jpe-ai-delegation` is enabled in the always-on `core` category. Its hooks
classify routable Agent calls, judge the bypass-immune shell-removal ask, and
put the session's `codex-quota` status in the system prompt.

## Session routing

Codex is ready when `codex` starts and `codex-quota` exits 0. Every class runs
on Codex Luna, the latest listed Luna slug from Codex's cache: `xhigh` for
standard work, `max` for complex, plan and deep work. Plan and deep run in a
read-only sandbox as advisory workers, as do `Explore` and `Plan` spawns. When
Codex is capped, unavailable or gives no answer, routable work goes to Haiku at
`xhigh`, the last resort; no class resolves to Sonnet or Opus. Explicit `opus`
and `sonnet` choices are preserved; explicit `haiku` is routed to Codex when
ready. Worktree-isolated spawns go to Haiku because `codex exec` cannot run in
the worktree.

| Class | Codex | Last resort |
| --- | --- | --- |
| standard | Luna, `xhigh` | Haiku, `xhigh` |
| complex | Luna, `max` | Haiku, `xhigh` |
| plan | Luna, `max` (read-only) | Haiku, `xhigh` |
| deep | Luna, `max` (read-only) | Haiku, `xhigh` |

Codex classifies the task read-only at `xhigh` and defaults to `standard` when
it gives no answer; nothing classifies when Codex is not ready. The permission judge uses Luna at
`xhigh` when ready, Haiku at `xhigh` otherwise, and leaves the core dialog when
it gets no verdict.

## Executor contract

The main session is the trusted lead: it owns intent, scope, security decisions,
architecture, final verification, and user communication. Delegates execute
bounded work and return evidence; they do not change product intent or claim
completion on the lead's behalf. Keep private content and privileged actions on
approved local routes. Shared model-tier guidance is in [model-tiers.md](../../../../ai-delegation/skills/premium-agent-orchestration/references/model-tiers.md).

## Local Codex CLI

Before a direct CLI run, check `command -v codex`, `codex login status`, and
`codex-quota`; proceed only when quota exits 0. Use the configured route and
Luna model at `xhigh` (standard) or `max` (complex, plan, deep).

## Repository and follow-up routing

Use one project thread per repository; see the
[claude-projects rule](https://github.com/dryvist/ai-assistant-instructions/blob/develop/agentsmd/rules/on-demand/claude-projects.md).
File follow-up work as a Vikunja task, never a GitHub issue. Shared doctrine:
`prompt://dryvist/auto-ai-agent/model-delegation`.
