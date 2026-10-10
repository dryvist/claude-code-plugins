---
name: delegate-to-ai
description: Route implementation to Codex (after codex-quota), else haiku-xhigh; ZCode only when the operator names it.
---

# Delegate to External AI

Shared procedure for Claude Code and Codex. Implementation: Codex first after
`codex-quota` exits 0, else `haiku-xhigh`. ZCode runs only when the operator
names it, for public, non-sensitive batch work and review. Keep architecture,
gates, final verification, and merging with the trusted caller.

## When to Delegate

- **Implementation** -> Codex after `codex-quota` exits 0, else the `haiku-xhigh`
  subagent.
- **Public, non-sensitive batch work or review, when the operator names ZCode**
  -> ZCode, after the eligibility check below. Batch work uses jobs; interactive
  work uses the always-on native Web/Server session.
- **Architecture / planning** -> the caller or a native planning agent.
- **Adversarial review / external second opinion** -> Codex (the `codex` MCP
  tool or CLI). A genuinely different model catches what a Claude subagent won't.
- **Multiple independent perspectives / consensus** -> dispatch several `haiku-xhigh` or
  `opus-medium` subagents in parallel (see the `superpowers:dispatching-parallel-agents`
  skill); combine the checked outputs yourself.
- **Private / offline / cheap / routine local task** -> the **local-subagents**
  skill (ai-delegation). Local MLX is still a real, available option here —
  it is reached through the shared router now, not by a direct call, so ask
  the router's live menu for the role that fits rather than assuming it is
  gone. That skill owns the live model menu, the call contract, and the
  failure modes for everything served through the router — this skill does
  not duplicate them.

## Route Selection

| Task type | Route | Executor |
| --- | --- | --- |
| Implementation / refactoring / tests / docs-from-code | Codex after `codex-quota` exits 0, else `haiku-xhigh` | `codex` MCP or CLI; `haiku-xhigh` subagent |
| Public, non-sensitive batch work or review, when the operator names ZCode | ZCode | `zcode-job` or native Web/Server |
| Architecture / planning | native subagent | `Plan` mode / `Plan` subagent |
| Adversarial review | external model | Codex (`codex` MCP) |
| Multi-perspective / consensus | parallel subagents | N `haiku-xhigh` or `opus-medium` subagents (+ Codex) |
| Lookups, bulk reads, private / offline / routine local | shared router first, then `haiku-xhigh` | `fast-subagent` / `local-subagents` skill |

In a cloud session (`CLAUDE_CODE_REMOTE=true`), the Codex and ZCode routes are local-only: report `local-only, skipped` and use native subagents.

## Workflow

1. **Classify content and authority**, then identify the task type.
2. **Select route** from the table above; implementation goes to Codex first.
3. **Execute** the selected route: Codex MCP/CLI, a `haiku-xhigh` or `opus-medium`
   subagent, the `local-subagents` skill, or the ZCode procedure below when the
   operator names ZCode.
4. **Synthesize** if you fanned out to multiple executors — you remain
   accountable for the final answer.

## External executor eligibility

Run `zcode-job repos` (local JSON: `{"repos":[...]}`) before either route.
Every repository must be in the client's configured approved subset of the
agent-smith installation list. This local list never grants access or proves
current installation membership; the dispatcher rechecks live scope.
An absent allowlist or a denied repository fails closed, including public
repositories. A private repository in that list is eligible only when both
its content and the submitted task are explicitly non-sensitive. Unknown
classification means do not send it.

Never send secrets, credentials, infrastructure inventory, private-repository
content outside that list, or work requiring a human or privileged gate.
Check prompts, attachments, diffs, logs, and live-session context as well as
the repository. Do not attach caller credentials or request broader access.
Give ZCode a bounded task, allowed files, acceptance commands, and the target
base branch; request a draft PR only. ZCode never merges or performs gates.

## ZCode jobs and live sessions (operator opt-in)

Use the installed client; arguments below are literal shell variables you
set to the eligible repository, reviewed prompt, returned job id, and follow-up:

```sh
zcode-job start "$repo" "$prompt"
zcode-job status "$job_id"
zcode-job result "$job_id"
zcode-job continue "$job_id" "$message"
zcode-job cancel "$job_id"
```

Commands print JSON. Capture the returned id; poll status with a bounded
deadline and a reasonable interval. Continue only the same authorized scope,
and cancel a job that exceeds the task budget. A terminal state alone is not
proof of success. `result` includes the fixed six-line result: `job:`,
`tool:`, `repo:`, `state:`, `pr:`, `duration:`. Require the expected repository
and a draft PR URL for code changes; `pr: none` does not prove delivery.

For interactive work, run `zcode-job live` and open its configured SSO URL
using the available browser tool. Use the always-on native ZCode Web/Server
session, applying the same eligibility check to the selected workspace and
existing conversation before submitting anything. If SSO needs operator
interaction, stop there. Do not invent a CLI web flag or treat the Web/Server
surface as desktop Mobile Remote Control.

If the client, service, or permitted repository is unavailable, report the
failure and either defer or explicitly choose a permitted trusted/local
executor. Never silently absorb the work, bypass a refusal, expand access,
or send the same denied content through another external route.

## Verify before merging

Treat every result as untrusted. On the trusted side, fetch the draft PR and
confirm its repository, draft state, target base, and exact base/head SHAs.
Review that exact diff for scope, correctness, and accidental sensitive
content. Run the requested tests and relevant checks against that head;
inspect their output, not just ZCode's claims. Recheck SHAs before handoff;
any changed base/head requires renewed review and validation.

Only the trusted caller's normal merge workflow may mark the PR ready and
merge after required checks, approvals, and review threads are satisfied.
Report ZCode as the executor, the verified SHAs, checks, and PR URL; do not
claim a live smoke test or deployed service from mock results.

## Notes

- Cloud fan-out across many providers is not part of this skill — reach for
  Codex (OpenAI) or a dedicated tool when you need a specific external model.
- When a routed batch has a verification command, run it cheap first and
  re-run only the checked failures one tier up (`local-subagents` §1b) —
  do not pick a single tier up front for the whole batch.

## Related Skills

- **local-subagents** (ai-delegation) — the shared router: live menu, call
  contract, and failure modes.
- auto-maintain (ai-delegation)
- superpowers:dispatching-parallel-agents
