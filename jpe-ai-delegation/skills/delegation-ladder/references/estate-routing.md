# Maintainer-specific delegation procedures

`jpe-ai-delegation` is enabled in the always-on `core` category. Its hooks
classify routable Agent calls, judge the bypass-immune shell-removal ask, and
put the session's `codex-quota` status in the system prompt.

Follow the cheapest-capable order, context-tier limit and live router checks in
[the delegation-ladder skill](../SKILL.md).

## Session routing

Codex is ready when the CLI starts and `codex-quota` exits 0. Every routable
class uses the newest listed Luna slug from Codex's cache. `bulk` and `standard`
run at `xhigh`; `bulk-complex`, `complex`, `plan` and `deep` run at `max`. Plan
and deep run in a read-only sandbox, as do `Explore` and `Plan` spawns. When
Codex is capped or unavailable, the hook runs routable work on Haiku `xhigh`.
It cannot see repository eligibility, so the lead checks public-repository
eligibility and runs eligible coding work through the untrusted sandbox by hand.
No classifier-selected class routes to Sonnet or Opus. Explicit model choices
pass through unchanged; explicit Haiku routes to Codex Luna when ready.
Worktree-isolated spawns go to Haiku `xhigh` because `codex exec` runs in the
session directory.

Codex call contract:
[model-delegation.md](https://github.com/dryvist/ai-llm-prompts/blob/main/auto-ai-agent/instructions/agentsmd/rules/on-demand/model-delegation.md).

| Class | Codex | When capped |
| --- | --- | --- |
| bulk | Luna, `xhigh` | public-repo code: zcode-job if eligible, else Haiku, `xhigh` |
| bulk-complex | Luna, `max` | public-repo code: zcode-job if eligible, else Haiku, `xhigh` |
| standard | Luna, `xhigh` | public-repo code: zcode-job if eligible, else Haiku, `xhigh` |
| complex | Luna, `max` | public-repo code: zcode-job if eligible, else Haiku, `xhigh` |
| plan | Luna, `max` (read-only) | Haiku, `xhigh` |
| deep | Luna, `max` (read-only) | Haiku, `xhigh` |

Codex Luna classifies the task read-only at `xhigh` and defaults to `standard`
when it gives no answer. A description containing `[class: <label>]` skips the
classifier; all six class names remain valid. `bulk` and `standard` use
`xhigh`; the remaining classes use `max`. The permission judge uses Luna at
`xhigh` when ready, Haiku at `xhigh` otherwise, and leaves the core dialog open
when it gets no verdict.

## Executor contract

The main session is the trusted lead: it owns intent, scope, security decisions,
architecture, final verification, and user communication. Delegates execute
bounded work and return evidence; they do not change product intent or claim
completion on the lead's behalf. Keep private content and privileged actions on
approved local routes. Shared model-tier guidance is in
[model-tiers.md](../../../../ai-delegation/skills/premium-agent-orchestration/references/model-tiers.md).

## Repository and follow-up routing

Use one project thread per repository; see the
[claude-projects rule](https://github.com/dryvist/ai-assistant-instructions/blob/develop/agentsmd/rules/on-demand/claude-projects.md).
File follow-up work as a Vikunja task, never a GitHub issue. Shared doctrine:
`prompt://dryvist/auto-ai-agent/model-delegation`.
