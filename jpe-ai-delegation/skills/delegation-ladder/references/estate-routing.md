# Maintainer-specific delegation procedures

`jpe-ai-delegation` is enabled in the always-on `core` category. Its hooks
classify routable Agent calls, judge the bypass-immune shell-removal ask, and
put the session's `codex-quota` status in the system prompt.

## Session routing

Codex is ready when `codex` starts and `codex-quota` exits 0. Every class runs
on Codex Terra, the latest listed Terra slug from Codex's cache (the latest Luna
slug when no Terra is listed), at `xhigh`. Plan and deep run in a
read-only sandbox as advisory workers, as do `Explore` and `Plan` spawns. When
Codex is capped or unavailable, routable work goes to Haiku at `xhigh`, the last
resort; no class resolves to Sonnet or Opus. When Codex is ready but gives no
answer, the spawn returns a `FAIL | router |` hand-back instead of running on
Haiku, so the lead splits or re-briefs the task. Explicit `opus`
and `sonnet` choices are preserved; explicit `haiku` is routed to Codex when
ready. Worktree-isolated spawns go to Haiku.

Codex call contract: [model-delegation.md](https://github.com/dryvist/ai-llm-prompts/blob/main/auto-ai-agent/instructions/agentsmd/rules/on-demand/model-delegation.md).

| Class | Codex | Last resort |
| --- | --- | --- |
| standard | Terra, `xhigh` | Haiku, `xhigh` |
| complex | Terra, `xhigh` | Haiku, `xhigh` |
| plan | Terra, `xhigh` (read-only) | Haiku, `xhigh` |
| deep | Terra, `xhigh` (read-only) | Haiku, `xhigh` |

Codex classifies the task read-only at `xhigh` and defaults to `standard` when
it gives no answer; nothing classifies when Codex is not ready. The permission judge uses Terra at
`xhigh` when ready, Haiku at `xhigh` otherwise, and leaves the core dialog when
it gets no verdict.

## Executor contract

The main session is the trusted lead: it owns intent, scope, security decisions,
architecture, final verification, and user communication. Delegates execute
bounded work and return evidence; they do not change product intent or claim
completion on the lead's behalf. Keep private content and privileged actions on
approved local routes. Shared model-tier guidance is in [model-tiers.md](../../../../ai-delegation/skills/premium-agent-orchestration/references/model-tiers.md).

## Repository and follow-up routing

Use one project thread per repository; see the
[claude-projects rule](https://github.com/dryvist/ai-assistant-instructions/blob/develop/agentsmd/rules/on-demand/claude-projects.md).
File follow-up work as a Vikunja task, never a GitHub issue. Shared doctrine:
`prompt://dryvist/auto-ai-agent/model-delegation`.
