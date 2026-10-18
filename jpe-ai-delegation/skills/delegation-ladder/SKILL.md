---
name: delegation-ladder
description: Apply the executor ladder for the maintainer's own setup, including eligibility and verification rules.
---

# Delegation ladder

Keep scope, security decisions, final verification, and merging with the trusted
caller. Classify task content before selecting a route:

| Kind | Ladder | Use |
| --- | --- | --- |
| `code` | Codex -> ZCode -> OpenCode Go -> Haiku high | Public implementation and code review |
| `private` | Codex -> OpenCode Go -> Haiku high | Private material |
| `other` | Codex -> Haiku high | Triage, bulk reads, summaries, judgment |

Run `agent-route <code|private|other> [--zcode available|exhausted]` from the
plugin root. ZCode defaults to exhausted. Codex qualifies while `codex-quota`
exits 0; use the first eligible rung and stop when none qualifies. Treat a
Z.ai quota or 429 error as exhausted for the rest of the session.

ZCode is limited to public repositories owned by `dryvist`, `JacobPEvans`, or
`JacobPEvans-personal` that also appear in the installed client subset. Treat
a missing repository, unknown visibility, absent owner approval, or missing
local dispatcher approval as private. Never send secrets, credentials, private
repository content, live infrastructure work, or privileged actions to ZCode.
Review task text, attachments, diffs, logs, and conversation context before
submission.

## Execute the selected route

- **Codex**: use the configured Codex CLI or MCP route.
- **ZCode**: use the existing `zcode-job` client.
- **OpenCode Go**: use the configured OpenCode Go route.
- **Haiku high**: use the high effort Haiku subagent.
- **Stop**: stop and notify the operator.

For ZCode work, write a bounded prompt with the allowed scope, repository
default branch, and acceptance criteria, then run `zcode-job repos`,
`zcode-job start <owner/repo> "<prompt>"`, `zcode-job status <job-id>`, and
`zcode-job result <job-id>`. Cancel with `zcode-job cancel <job-id>` when the
deadline passes. The dispatcher creates implementation PRs as drafts; the
trusted lead verifies the exact PR, repository, base branch, diff, checks, and
head SHA, then marks it ready. Never ask an executor to merge, approve a gate,
or use a credential. A refusal means the repository does not qualify.

## Related skills

- **delegate-to-ai** (ai-delegation) — generic delegation guidance.
- **local-subagents** (ai-delegation) — local model menu and call contract.
- **multi-model-review** (ai-delegation) — independent review and synthesis.
- [Maintainer-specific routing and executor contract](references/estate-routing.md).
