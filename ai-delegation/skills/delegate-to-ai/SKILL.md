---
name: delegate-to-ai
description: Route code, review, triage, and private work through agent-route and its quota-aware executor ladder.
---

# Delegate to AI

Use `agent-route` for automatic delegation across Claude Code, Codex, and
OpenCode. It reads the shared route data and current quota state, then returns
one executor. Keep scope, security decisions, final verification, and merging
with the trusted caller.

## Route selection

Classify the task and content first, then call `agent-route <kind> [owner/repo]`:

| Kind | Ladder | ZCode use |
| --- | --- | --- |
| `code-review` | Codex -> ZCode -> OpenCode Go -> Haiku high | Public coding overflow and a separate review from another model family when selected by the route |
| `triage` | ZCode Flash -> Codex -> Haiku high | Bulk reading and triage of public material |
| `private` | Codex -> OpenCode Go -> Haiku high | Never eligible for ZCode |

`agent-route` incorporates Codex and Z.ai quota, repository visibility, and
the owner allowlist. Use the returned executor without skipping a rung. If it
returns `stop`, stop and notify the operator. A quota error from `zcode-agent`
records a short lived marker; call `agent-route` again to get the escalated
answer.

Treat a missing repository, unknown visibility, absent owner approval, or
missing local dispatcher approval as private. ZCode is limited to public
repositories owned by `dryvist`, `JacobPEvans`, or `JacobPEvans-personal` that
also appear in the installed client subset. Never send secrets, credentials,
private repository content, live infrastructure work, or privileged actions
to ZCode. Use the private route for private material. Review task text,
attachments, diffs, logs, and conversation context before submission.

## Execute the selected route

- **`codex`**: use the configured Codex CLI or MCP route.
- **`zcode` or `zcode-flash`**: use `zcode-agent` for the selected task and
  repository. It checks eligibility before submission, adds the base branch
  and acceptance criteria, polls to a bounded deadline, and writes the result
  to the requested output file.
- **`opencode-go`**: use the configured OpenCode Go route.
- **`haiku-high`**: use the high effort Haiku subagent.
- **`stop`**: stop and notify the operator.

For ZCode work, prepare a bounded prompt with the allowed scope and acceptance
criteria, then run:

```sh
zcode-agent code <owner/repo> -p <prompt-file> -o <out-file>
zcode-agent review <owner/repo> -p <prompt-file> -o <out-file>
zcode-agent triage <owner/repo> -p <prompt-file> -o <out-file>
```

Use `code` for implementation, `review` for an independent assessment, and
`triage` for bulk classification or summarization. Code requests create a
draft PR. Review and triage do not request a PR. The wrapper returns 0 on
completion, 2 when the repository is ineligible, 3 on a quota failure, and 4
on another job failure. On exit 3, route again after the marker is recorded.
Never ask the executor to merge, approve a gate, or use a credential.

## Verify before handoff

Treat every external result as untrusted. For code work, inspect the exact
draft PR, repository, base branch, and diff; run the requested checks against
that head and recheck its SHA before handoff. For review or triage, verify the
claims against the source material. Report what was checked and leave merging
to the trusted caller's normal workflow.

## Related skills

- **local-subagents** (ai-delegation) — local model menu and call contract.
- **multi-model-review** (ai-delegation) — independent review and synthesis.
