---
name: delegation-ladder
description: Apply the executor ladder for the maintainer's own setup, including eligibility and verification rules.
---

# Delegation ladder

Keep scope, security decisions, final verification, and merging with the trusted
caller. Classify task content before selecting a route. Use the cheapest capable
route in this order:

1. Handle a handful of tool calls inline.
2. Use the local LLM router lanes for text-only extract, summarize, classify and
   draft work.
3. Use the untrusted sandbox (`zcode-job`) for public-repo work only. It runs
   ZCode on Z.ai GLM flash, OpenCode on OpenCode Go flash, contributor and free
   models.
4. Use Codex Luna `xhigh` or `max` for everything else.
5. Use Haiku `xhigh` as the capped last resort.

Keep each task below the target model's context price tier. Split it rather than
crossing that tier. Read model lists, prices, context tiers, peak windows and
caps live from the router. Never hard-code them.

| Kind | Sandbox eligibility | Use |
| --- | --- | --- |
| `code` | Public repos only | Public-repo implementation and code review |
| `private` | No | Private material stays on approved local routes |
| `other` | No | Triage, bulk reads, summaries, judgment |

Run `agent-route <code|private|other>` from the plugin root to inspect executor
eligibility. Apply the cost order above before dispatch; the helper does not
inspect text-only router lanes, prices or context tiers.

## Execute the selected route

- **Local LLM router lanes**: use for text-only extract, summarize, classify and
  draft work. Read current model lists, prices, context tiers, peak windows and
  caps from the router.
- **zcode-job sandbox**: coding tasks in public repositories only. Dispatch with
  `zcode-job start [--tool zcode|opencode|opencode-local|opencode-zai|cursor-agent|qwen-code] <repo> <prompt>`.
  Poll with `zcode-job status <job_id>`, read `zcode-job result <job_id>`, and
  stop with `zcode-job cancel <job_id>`. Classify the task text, attachments,
  diff and log before dispatch. Secrets, credentials, inventory and incident
  content never leave the lead. Leak-scan the output before review. The job
  returns a ready PR labelled `human:review`; never auto-merge it.
- **Codex Luna**: use `xhigh` for `bulk` and `standard`; use `max` for
  `bulk-complex`, `complex`, `plan` and `deep`. Plan and deep run as read-only
  advisory workers. An off-base answer can be retried with a valid
  `[class: <label>]` in the description. The call contract is in
  [model-delegation.md](https://github.com/dryvist/ai-llm-prompts/blob/main/auto-ai-agent/instructions/agentsmd/rules/on-demand/model-delegation.md).
- **Haiku xhigh**: use as the capped last resort. The hook also uses Haiku for
  worktree-isolated spawns because `codex exec` runs in the session directory.
  An explicit Haiku spawn routes to Codex Luna `xhigh` while Codex is ready.
- **Stop**: stop and notify the operator when no route qualifies.

The spawn router in `hooks/register.ts` runs Codex and Haiku only. It cannot see
repository eligibility, so the lead checks public-repository eligibility before
using `zcode-job`.

## Second-opinion review (agy)

Antigravity (`agy`, Gemini 3.8 Flash) gives an independent second opinion on a
high-risk diff. It is a reviewer, not an executor: it does not edit, merge, or
join the ladder. Use it on public repos and on trusted repos the operator names.

Non-interactive call, checked with `agy --help` and a live run on 2026-10-31:

```sh
agy -p="Read <brief-file> and review the diff it names. Reply with findings only, one per line: SEVERITY | file:line | issue." \
  --add-dir <dir-holding-brief-and-diff> --model gemini-3.8-flash-high --mode plan --output-format text
```

- `-p` takes its prompt as a value. It does not read stdin, so put the paths to
  the brief and diff inside the prompt, and pass their directory with `--add-dir`.
- Pin `--model gemini-3.8-flash-high` (or `gemini-3.8-flash-medium`). `agy models`
  also lists Claude models, which this policy forbids here.
- `--mode plan` is the flag agy documents for plan mode. Its help does not say it
  blocks writes, so the brief must also say not to edit.
- Read stdout and the exit code. A non-zero exit or empty reply is a failed
  review. Never report it as a pass.

## Verification

Never ask an executor to merge, approve a gate, or use a credential. The trusted
lead verifies the exact PR, repository, base branch, diff, checks, and head SHA
before any merge. Review task text, attachments, diffs, logs, and conversation
context before submission. Never send secrets, credentials, private repository
content, live infrastructure work, or privileged actions to an external
executor, including zcode-job and agy.

## Related skills

- **delegate-to-ai** (ai-delegation) — generic delegation guidance.
- **local-subagents** (ai-delegation) — local model menu and call contract.
- **multi-model-review** (ai-delegation) — independent review and synthesis.
- [Maintainer-specific routing and executor contract](references/estate-routing.md).
