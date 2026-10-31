---
name: delegation-ladder
description: Apply the executor ladder for the maintainer's own setup, including eligibility and verification rules.
---

# Delegation ladder

Keep scope, security decisions, final verification, and merging with the trusted
caller. Classify task content before selecting a route. The routing order is stated
once, in the `ai-llm-prompts` AGENTS.md ("Delegation routing"). This skill and the hook follow it.

| Kind | Ladder | Use |
| --- | --- | --- |
| `code` | Codex -> zcode-job sandbox -> Z.ai GLM -> OpenCode Go -> Haiku xhigh | Public-repo implementation and code review |
| `private` | Codex -> zcode-job sandbox -> Z.ai GLM -> OpenCode Go -> Haiku xhigh | Private material; the sandbox only for an allowlisted repo |
| `other` | Codex -> Haiku xhigh | Triage, bulk reads, summaries, judgment |

Run `agent-route <code|private|other>` from the plugin root. Codex qualifies
while `codex-quota` exits 0; use the first eligible rung and stop when none
qualifies. Claude orchestrates only: no Sonnet, Opus, or Fable subagent, and Haiku
xhigh is the last resort. ZCode runs only through `zcode-job`.

## Execute the selected route

- **Codex**: newest Terra model at `medium` by default and `high` (never higher)
  for complex, plan and deep work; newest Luna model at `xhigh` for bulk
  (price-sensitive) work and `max` for bulk work that is still somewhat
  complicated. For auth, secrets, router, memory and cluster work, name
  `[class: bulk-complex]` in the description to get Luna `max`. Plan and deep run
  as read-only advisory workers. An off-base answer re-runs one tier up: Luna
  xhigh, Luna max, Terra medium, Terra high. Call contract:
  [model-delegation.md](https://github.com/dryvist/ai-llm-prompts/blob/main/auto-ai-agent/instructions/agentsmd/rules/on-demand/model-delegation.md).
- **zcode-job sandbox**: coding tasks only, on public repos and on allowlisted
  private repos. Dispatch with `zcode-job start [--tool zcode|opencode|opencode-local|opencode-zai|cursor-agent|qwen-code] <repo> <prompt>`.
  Poll `zcode-job status <job_id>`, read `zcode-job result <job_id>`, and stop a
  job with `zcode-job cancel <job_id>`. The default tool is `zcode`; pass
  `--tool opencode` for the homelab OpenCode sandbox. Reference: the `ZCode client`
  section of nix-agent-sandbox `README.md`.
  Run all gates before `start`:
  1. Public repo: no property check. Private repo: the GitHub repo property
     `ai-untrusted-ok=true` must be set.
  2. Classify the payload before dispatch: task text, attachments, and any diff or
     log text. Secrets, credentials, inventory, and incident content never leave the lead.
  3. Before merge, leak-scan the output. The job returns a ready PR labelled
     `human:review`. Never auto-merge it. The lead verifies the diff and checks.

  For a private repo, the lead sets `AGENT_ROUTE_SANDBOX_ALLOWLISTED=yes` only
  after gates 1 and 2 pass. `agent-route` cannot check gates 1 or 2 itself, so
  without that variable it skips the sandbox for `private`.
- **Z.ai GLM**: run the task through `codex-zai`.
- **OpenCode Go**: use the configured OpenCode Go route.
- **Haiku xhigh**: last resort. While Codex is capped, the hook runs a spawn on
  Haiku `xhigh`. While Codex has quota, an explicit Haiku spawn runs on Codex.
- **Stop**: stop and notify the operator.

The spawn router in `hooks/register.ts` runs only the Codex and Haiku rungs. It
cannot see repo eligibility, so the lead runs the zcode-job sandbox, GLM and
OpenCode Go rungs by hand.

## Second-opinion review (agy)

Antigravity (`agy`, Gemini 3.8 Flash) gives an independent second opinion on a
high-risk diff. It is a reviewer, not an executor: it does not edit, merge, or
join the ladder. Use it on public repos and on trusted repos the operator names.

Non-interactive call, checked with `agy --help` and a live run on 2026-10-31:

```sh
agy -p="Read <brief-file> and review the diff it names. Reply with findings only, one per line: SEVERITY | file:line | issue." \
  --add-dir <dir-holding-brief-and-diff> --model gemini-3.8-flash-high --mode plan --output-format text
```

- `-p` takes the prompt as its value. It does not read stdin, so put the paths to
  the brief and the diff inside the prompt, and pass their directory with `--add-dir`.
- Pin `--model gemini-3.8-flash-high` (or `gemini-3.8-flash-medium`). `agy models`
  also lists Claude models, which this policy forbids here.
- `--mode plan` is the flag agy documents for plan mode. Its help does not say it
  blocks writes, so the brief must also say not to edit.
- Read stdout and the exit code. A non-zero exit or empty reply is a failed review.
  Never report it as a pass.

## Verification

Never ask an executor to merge, approve a gate, or use a credential. The trusted
lead verifies the exact PR, repository, base branch, diff, checks, and head SHA
before any merge. Review task text, attachments, diffs, logs, and conversation
context before submission. Never send secrets, credentials, private repository
content, live infrastructure work, or privileged actions to an external executor,
including zcode-job and agy.

## Related skills

- **delegate-to-ai** (ai-delegation) — generic delegation guidance.
- **local-subagents** (ai-delegation) — local model menu and call contract.
- **multi-model-review** (ai-delegation) — independent review and synthesis.
- [Maintainer-specific routing and executor contract](references/estate-routing.md).
