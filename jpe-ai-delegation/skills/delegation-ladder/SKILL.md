---
name: delegation-ladder
description: Apply the executor ladder for the maintainer's own setup, including eligibility and verification rules.
---

# Delegation ladder

Route each delegated task to the first rung that qualifies. Check codex-quota first.
Rung 2 holds two equal first choices, split by sensitivity; when both qualify,
use the usage-pace order in the executor section below and spend every
subscription before it resets (ZCode 5-hour and weekly, OpenCode Go monthly,
Codex weekly).

1. Small, quick, checkable tasks (summarize, extract, classify, reformat, a first pass over a file or log) go to
   the router local default or medium capability before any subscription; escalate only after a checked failure.
2. ZCode or Codex Luna:
   - ZCode (`zcode-job`): obvious, definitely non-sensitive work in public repos. Coding and coding-adjacent only:
     code, tests, GitHub automation and workflows, code reviews. Open-internet research needs a separate untrusted, internet-open container.
     The output is a ready PR labelled `human:review`. Leak-scan it before merge. Never auto-merge it.
   - Codex Luna: anything even remotely sensitive, or any private repo. Luna `xhigh` default, `max` as needed.
     Codex qualifies while `codex-quota` exits 0 (more than 5% left). Never Terra.
     Complicated bulk and mandatory auth, secrets, router, memory and cluster topics take `max` and name `[class: bulk-complex]`.
3. Other subscriptions where they fit, e.g. OpenCode Go (`zcode-job --tool opencode`) and Z.ai GLM. Public work only,
   preferred while that subscription is at or under its pace for the billing period, tried last when over it.
4. Haiku `xhigh`, the last resort, only after rungs 1, 2 and 3 are exhausted or do not qualify; even then Haiku runs before the orchestrator works solo.

Never Sonnet, Opus or Fable subagents.
Never send secrets, credentials, inventory or incident content to any executor.
Antigravity (`agy`) stays a second-opinion reviewer, never an executor.

| Kind | Ladder | Sandbox eligibility | Use |
| --- | --- | --- | --- |
| `code` | zcode-job sandbox -> Codex -> Z.ai GLM -> OpenCode Go -> Haiku xhigh | Public coding tasks | Implementation |
| `private` | Codex -> Haiku xhigh | Ineligible | Private tasks |
| `other` | Codex -> Z.ai GLM -> OpenCode Go -> Haiku xhigh | Ineligible | Reads, triage, summaries, review and planning |

## Dispatch and completion

The lead classifies the full payload, including attachments, diffs, logs and
conversation context, before dispatch. Use placeholders in work about sensitive
systems. The hook screens inline payloads locally before calling any classifier
or executor; it cannot inspect attachments or files that workers might read.
The lead must keep prohibited content out of executor-accessible context.

Codex uses the newest listed Luna slug in its local model cache. Plan, design
and architecture review use the `plan` or `deep` class and a read-only sandbox,
as do `Explore` and `Plan` agents. Explicit class tags select these routes;
mandatory bulk-complex topics override model selection while preserving an
explicit `plan` or `deep` read-only sandbox. Explicit models, named agents and
worktree isolation cannot bypass the ladder. Isolated Codex tasks get a
detached worktree, whose path is returned for review. Custom-agent
instructions are preserved; namespaced plugin agents resolve from the local
installed-plugin registry. Missing definitions stop dispatch.

The hook places each task in this order and logs one JSON `route` line per
decision to `~/.claude/ai-delegation.log`:

1. Eligibility. On-host local aliases, Codex and Haiku may see any task. ZCode,
   OpenCode Go (`zcode-job --tool opencode`) and Cursor
   (`zcode-job --tool cursor-agent`) see only non-sensitive `[task: code]` work
   in a verified public repository; their dispatcher refuses private ones.
2. Local. A generic, non-isolated, non-code spawn marked `[class: text]` goes
   to the on-host `small` alias, or `local-only` when the prompt is larger.
   Put all of the task's text in the prompt; the local model has no tools. The token estimate (characters / 3.5 plus 2048 output) must fit in
   60% of the alias's context window from the router's `/model/info`. An empty
   answer, a length cut-off, an error or a timeout falls through.
3. Subscriptions. Quota comes from one instant query to the metrics store at
   `AGENT_QUOTA_QUERY_URL` for the `agent_quota_used_percent`,
   `agent_quota_window_seconds` and `agent_quota_reset_timestamp_seconds`
   series, grouped by `executor` and `window`. The plugin ships no default:
   unset means every quota is unknown and no request is made. When the URL
   is https and `AGENT_QUOTA_TOKEN_FILE` names a file holding one token (no
   whitespace or control characters once trimmed), the request carries
   `Authorization: Bearer` with it, read at call time and never logged;
   otherwise it carries no header. The route admits only the exact selector
   string. The hook reads it once per session with a 3-second timeout, which
   covers the token read, and refreshes it in the
   background every 10 minutes. An unreachable store, a timeout, a non-OK
   status (including 401 and 403) or bad JSON reads as `quota_unreachable`; a window sampled more than
   15 minutes ago reads as `quota_stale`; an executor with no series reads as
   `quota_missing`. Unknown is never scored as empty or full, and the route
   event lists each reason under `quota_unknown`. An executor with a
   live window at 95% or more drops out. Order: promotions; at/below-line by distance
   (furthest under), no readings in table order, then over-line by distance (least over).
   Pace line: 0 at start, 100 one day before reset (at reset for <2-day windows); use
   each executor's smallest distance across windows. Effective score (headroom / (price × peak)) is route-line telemetry only, not ranking. The executor table in
   `hooks/lib/policy.ts` lists ZCode, OpenCode Go, Codex and Cursor, each with
   transport, trust, `private_ok`, quota executor name, price and peak
   windows (ZCode costs double Mon–Fri 06:00–10:00 UTC). `~/.config/ai-delegation/executors.json` (a JSON
   array of rows) overrides rows by `id` and adds new ones; invalid rows are
   logged and dropped, and only subscription-trusted rows may set
   `private_ok`; a sandbox row is always `sandbox-public` with `private_ok`
   false. A row with `kind: "promotion"` needs `expires`, sorts first until
   then, and, like every row, uses the `codex`, `sandbox` or `router-chat`
   transport. A `router-chat` row answers only what the local rung would
   take (`[class: text]`, never `[task: code]`) through the same
   `LITELLM_LOCAL_BASE_URL` chat call and the same size gate. An unpaid
   row must name an on-host alias (`small` or `local-only`) and be
   subscription-trusted with `private_ok` to see that work. A
   `billing: "paid"` row may name any router model; it carries
   `budget_daily_usd` (finite and positive; it documents the router key's
   own daily cap; the hook does not compare it) and `budget_key` (the router
   key alias), and is never `private_ok`. A paid row is eligible only for
   public work and only while `litellm_remaining_api_key_budget_metric` for
   that alias is fresh and above zero in the quota query result. No paid row
   can dispatch today: text work carries no public marker, and code work
   never reaches a router-chat row. `AGENT_ROUTE_ZCODE_TOOLS`, when set, limits which sandbox
   tools run; unset runs every table row's tool. Each `route` line lists
   `skipped` rows with a reason: `ineligible`, `exhausted`, `expired`,
   `not_installed`, `failed`, `recent_failures`, `budget_unknown` or
   `budget_spent`.
4. Haiku `xhigh` ends every list. A Codex failure, an empty answer or an
   unknown quota moves to the next executor; only forbidden models, prohibited
   payloads and a sandbox job that may still open a PR stop routing.

For sandbox coding, put `[task: code] [repo: owner/repository]` in the
description. A public-repo tag alone does not establish that work is coding.
The sandbox takes public repositories only; a private repository stays with
Codex Luna. The hook verifies the returned PR belongs to the requested
repository, is open and non-draft, and has `human:review`. When a job returns
no verified PR, the hook reads `zcode-job status <job>` and acts on its `end`
field. If the job ended without a PR, the task moves to the next eligible
executor; `fell_through_from` names the sandbox and `skipped` gives `failed`.
If the job ended `cancelled`, routing stops for that task: the hook writes its
outcome line and a route line with reason `sandbox job cancelled`. If the job is
still running, opened a PR, or has no readable `end`, the handoff fails; inspect
that job before retrying.

Every `route` line lists its sandbox jobs under `jobs` (`job`, `repo`,
`executor`, and `started_ms`, the hook's clock just before the start call).
When a later placement has a sandbox executor as a candidate, the hook reads the
last 128 KiB of the decision log; a truncated read counts as no history. It
reads `status` for up to five recent jobs that have no outcome yet, within 3
seconds in total, and writes one `outcome` line (`job`, `repo`, `executor`,
`end`, `ended_ms`) for each job that has ended. `ended_ms` is the start plus the
job's `duration`, never later than the observation; without a duration it is
the observation time. The hook keeps no store of its own; it reads these lines
back from the decision log, counts one outcome per job, and ignores lines
stamped more than a minute in the future. An executor is skipped for a
repository with reason `recent_failures` when two or more of its last three
ended jobs there ended `no_commit`, `timeout`, `rate_limited` or `refused`. The
skip lasts 60 minutes after the newest failure's `ended_ms`, or until the end of
that UTC hour when it is `rate_limited`. Status reads on a failed start stop
after 15 seconds.
The hook never merges. Leak-scan the exact PR head before any human merge.

The permission judge alone uses the GLM and OpenCode Go chat transports, through
`AGENT_ROUTE_GLM_MODEL` and `AGENT_ROUTE_OPENCODE_GO_MODEL` with `LLM_ROUTER_URL`
and `LLM_ROUTER_TOKEN_FILE`, or `LITELLM_LOCAL_BASE_URL`. Agent spawns marked
`[class: text]` go to the local rung instead. Supply all required text in the
prompt. Work requiring repository access, edits, tests or other tools continues
to a tool-capable executor. Coding tags, custom agents, `Explore`, `Plan` and
isolated tasks never take the local rung.

Run `agent-route <code|private|other>` from the plugin root to inspect the
first eligible executor. `code` means public coding; use `other` for read-only
work even in public repos. The helper reports a route; it does not dispatch or
verify the repository. `AGENT_ROUTE_CODEX_QUOTA=available|exhausted` and
`AGENT_ROUTE_ZCODE_AVAILABLE=yes|no` are test overrides.

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
before any merge. Classify the complete input before submission and leak-scan
the output before merge. Apply the prohibited-content rule to every executor
and second-opinion reviewer.

## Related skills

- **delegate-to-ai** (ai-delegation) — generic delegation guidance.
- **local-subagents** (ai-delegation) — local model menu and call contract.
- **multi-model-review** (ai-delegation) — independent review and synthesis.
- [Maintainer-specific routing and executor contract](references/estate-routing.md).
