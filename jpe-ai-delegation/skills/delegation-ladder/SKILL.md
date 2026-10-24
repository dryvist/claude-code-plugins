---
name: delegation-ladder
description: Apply the executor ladder for the maintainer's own setup, including eligibility and verification rules.
---

# Delegation ladder

Keep scope, security decisions, final verification, and merging with the trusted
caller. Classify task content before selecting a route:

| Kind | Ladder | Use |
| --- | --- | --- |
| `code` | Codex -> Z.ai GLM -> OpenCode Go -> Haiku xhigh | Implementation and code review |
| `private` | Codex -> Z.ai GLM -> OpenCode Go -> Haiku xhigh | Private material |
| `other` | Codex -> Haiku xhigh | Triage, bulk reads, summaries, judgment |

Run `agent-route <code|private|other>` from the plugin root. Codex qualifies
while `codex-quota` exits 0; use the first eligible rung and stop when none
qualifies. Claude orchestrates only: no Sonnet or Opus subagent, and Haiku
xhigh is the last resort. ZCode is not on any ladder.

## Execute the selected route

- **Codex**: newest Luna model only; effort `xhigh` for standard work, `max`
  for complex, plan and deep work. Plan and deep run as read-only advisory
  workers. Call contract: [model-delegation.md](https://github.com/dryvist/ai-llm-prompts/blob/main/auto-ai-agent/instructions/agentsmd/rules/on-demand/model-delegation.md).
- **Z.ai GLM**: run the task through `codex-zai`.
- **OpenCode Go**: use the configured OpenCode Go route.
- **Haiku xhigh**: use the xhigh effort Haiku subagent.
- **Stop**: stop and notify the operator.

The spawn router in `hooks/register.ts` runs the Codex and Haiku rungs itself.
It does not run Z.ai GLM or OpenCode Go; follow the selected route by hand for those rungs.

Never ask an executor to merge, approve a gate, or use a credential. The trusted
lead verifies the exact PR, repository, base branch, diff, checks, and head SHA
before any merge. Review task text, attachments, diffs, logs, and conversation
context before submission, and never send secrets, credentials, private
repository content, live infrastructure work, or privileged actions to an
external executor.

## Related skills

- **delegate-to-ai** (ai-delegation) — generic delegation guidance.
- **local-subagents** (ai-delegation) — local model menu and call contract.
- **multi-model-review** (ai-delegation) — independent review and synthesis.
- [Maintainer-specific routing and executor contract](references/estate-routing.md).
