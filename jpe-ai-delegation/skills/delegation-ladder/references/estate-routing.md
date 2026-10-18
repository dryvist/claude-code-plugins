# Maintainer-specific delegation procedures

`jpe-ai-delegation` is enabled in the always-on `core` category. Its hooks
classify routable Agent calls, judge the bypass-immune shell-removal ask, and
put the session's `codex-quota` status in the system prompt.

## Session routing

Codex is ready when `codex` starts and `codex-quota` exits 0. Every Codex class
runs Luna at `xhigh`; the latest listed Luna slug comes from Codex's cache.
When Codex is unavailable, routable work uses the Claude column. Plan and deep
work stay on Sonnet. Explicit `opus` and `sonnet` choices are preserved;
explicit `haiku` is routed to Codex when ready. Worktree-isolated spawns stay
on Claude. `Explore` and `Plan` use read-only sandboxes.

| Class | Codex | Claude fallback |
| --- | --- | --- |
| standard | Luna, `xhigh` | Haiku, `xhigh` |
| complex | Luna, `xhigh` | Haiku, `xhigh` |
| plan | — | Sonnet, `high` |
| deep | — | Sonnet, `high` |

The classifier defaults to `standard` if ready Codex gives no answer and never
falls back to Haiku while Codex is ready. A task Codex cannot answer passes
through unchanged. The permission judge uses Luna at `xhigh` when ready, Haiku
at `xhigh` otherwise, and leaves the core dialog when it gets no verdict.

## Executor contract

The main session is the trusted lead: it owns intent, scope, security decisions,
architecture, final verification, and user communication. Delegates execute
bounded work and return evidence; they do not change product intent or claim
completion on the lead's behalf. Keep private content and privileged actions on
approved local routes. Shared model-tier guidance is in [model-tiers.md](../../../../ai-delegation/skills/premium-agent-orchestration/references/model-tiers.md).

## Local Codex CLI

Before a direct CLI run, check `command -v codex`, `codex login status`, and
`codex-quota`; proceed only when quota exits 0. Use the configured route and
Luna model at `xhigh`.

## Repository and follow-up routing

Use one project thread per repository; see the
[claude-projects rule](https://github.com/dryvist/ai-assistant-instructions/blob/develop/agentsmd/rules/on-demand/claude-projects.md).
File follow-up work as a Vikunja task, never a GitHub issue. Shared doctrine:
`prompt://dryvist/auto-ai-agent/model-delegation`.
