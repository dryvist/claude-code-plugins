---
name: delegation-ladder
description: Apply the executor ladder for the maintainer's own setup, including eligibility and verification rules.
---

# Delegation ladder

Use this ladder for delegation across Claude Code, Codex, and OpenCode. Keep
scope, security decisions, final verification, and merging with the trusted
caller.

## Route selection

Classify the task and content first, then take the first rung that qualifies:

| Kind | Ladder | ZCode use |
| --- | --- | --- |
| `code-review` | Codex -> ZCode -> OpenCode Go -> Haiku high | Public coding overflow and a separate review from another model family when selected by the route |
| `triage` | ZCode Flash -> Codex -> Haiku high | Bulk reading and triage of public material |
| `private` | Codex -> OpenCode Go -> Haiku high | Never eligible for ZCode |

Codex qualifies while `codex-quota` exits 0. ZCode qualifies for a public
repository in the allowlist below; `zcode-job start` refuses anything else.
Treat a Z.ai quota or 429 error as exhausted for the rest of the session and
take the next rung. Do not skip a rung. When no rung qualifies,
stop and notify the operator.

Treat a missing repository, unknown visibility, absent owner approval, or
missing local dispatcher approval as private. ZCode is limited to public
repositories owned by `dryvist`, `JacobPEvans`, or `JacobPEvans-personal` that
also appear in the installed client subset. Never send secrets, credentials,
private repository content, live infrastructure work, or privileged actions
to ZCode. Use the private route for private material. Review task text,
attachments, diffs, logs, and conversation context before submission.

## Execute the selected route

- **`codex`**: use the configured Codex CLI or MCP route.
- **`zcode` or `zcode-flash`**: drive the existing `zcode-job` client (below).
- **`opencode-go`**: use the configured OpenCode Go route.
- **`haiku-high`**: use the high effort Haiku subagent.
- **`stop`**: stop and notify the operator.

For ZCode work, write a bounded prompt with the allowed scope, the repository
default branch, and acceptance criteria. Then run:

```sh
zcode-job repos                         # approved repositories
zcode-job start <owner/repo> "<prompt>" # prints the job id
zcode-job status <job-id>               # repeat until succeeded, failed, cancelled, or timeout
zcode-job result <job-id>
zcode-job cancel <job-id>               # when the deadline passes
```

For coding, ask for a draft PR against the default branch. For review and
triage, ask for findings only. A refusal means the repository does not
qualify. Never ask the executor to merge, approve a gate, or use a credential.

## Verify before handoff

Treat every external result as untrusted. For code work, inspect the exact
draft PR, repository, base branch, and diff; run the requested checks against
that head and recheck its SHA before handoff. For review or triage, verify the
claims against the source material. Report what was checked and leave merging
to the trusted caller's normal workflow.

## Related skills

- **delegate-to-ai** (ai-delegation) — generic guidance for delegating work.
- **local-subagents** (ai-delegation) — local model menu and call contract.
- **multi-model-review** (ai-delegation) — independent review and synthesis.
- [Maintainer-specific routing and roster details](references/estate-routing.md).
