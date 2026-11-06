# Maintainer-specific delegation procedures

`jpe-ai-delegation` is enabled in the always-on `core` category. Its hooks
classify routable Agent calls, judge the bypass-immune shell-removal ask, and
put the session's `codex-quota` status in the system prompt.

Follow the binding order and eligibility rules in
[the delegation-ladder skill](../SKILL.md).

## Session routing

Check `codex-quota` before considering an executor. An exit of 0 selects Codex;
an exit of 1 permits the capped ladder. Other exits stop dispatch. A missing
Codex CLI or failed Codex invocation while quota is available also stops.

| Class | Codex |
| --- | --- |
| bulk, reads, triage | Luna, `xhigh` |
| bulk-complex, including auth/secrets/router/memory/cluster | Luna, `max` |
| standard implementation | Terra, `medium` |
| complex | Terra, `high` |
| plan | Terra, `high`, read-only |
| deep: design or architecture review | Terra, `high`, read-only |

Mandatory topics override explicit class tags and name `[class: bulk-complex]`.
Model selection uses the newest listed slug in the selected family from the
Codex cache. The command builder rejects family mismatches and effort values
outside the assigned ranges. `Explore` and `Plan` spawns stay read-only.

Only while capped, try eligible zcode-job coding work, then Z.ai GLM, then
OpenCode Go, then Haiku `xhigh` as the last resort. Public repositories qualify
for sandbox coding; private repositories need `ai-untrusted-ok=true` and
payload classification before dispatch. A repository tag alone never makes
read-only work eligible. The sandbox must return a ready PR labelled
`human:review`; the hook verifies it, and the lead leak-scans it before merge.
Never auto-merge it.

Sonnet, Opus and Fable choices are denied, including custom-agent definitions.
Other explicit model choices and named agents still follow the ladder.
Worktree isolation creates a separate checkout for Codex rather than selecting
a later executor. Custom-agent instructions are loaded before classification;
unresolved definitions fail closed.

The permission judge uses Codex Luna `xhigh` while quota is available (`max`
for mandatory bulk-complex topics), then configured GLM, OpenCode Go and Haiku `xhigh` only while capped. No verdict
leaves the core dialog open. Prohibited inline content is screened locally
before any classifier, judge or executor receives it; the lead classifies all
remaining context before dispatch.

## Executor contract

The main session is the trusted lead: it owns intent, scope, security decisions,
architecture, final verification, and user communication. Delegates execute
bounded work and return evidence; they do not change product intent or claim
completion on the lead's behalf. Keep private content and privileged actions on
approved local routes. Shared model-tier guidance is in
[model-tiers.md](../../../../ai-delegation/skills/premium-agent-orchestration/references/model-tiers.md).

## Repository and follow-up routing

Use one project thread per repository; see the
[claude-projects rule](https://github.com/dryvist/ai-llm-prompts/blob/main/auto-ai-agent/instructions/agentsmd/rules/on-demand/claude-projects.md).
File follow-up work as a Vikunja task, never a GitHub issue. Shared doctrine:
`prompt://dryvist/auto-ai-agent/model-delegation`.
