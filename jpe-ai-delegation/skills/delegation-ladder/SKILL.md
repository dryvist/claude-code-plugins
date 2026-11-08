---
name: delegation-ladder
description: Apply the executor ladder for the maintainer's own setup, including eligibility and verification rules.
---

# Delegation ladder

Route each delegated task to the first rung that qualifies. Check codex-quota first.
Rung 1 holds two equal first choices, split by sensitivity; when both qualify,
send the task to the executor with more quota headroom and spend every
subscription before it resets (ZCode 5-hour and weekly, OpenCode Go monthly,
Codex weekly).

1. ZCode or Codex Luna:
   - ZCode (`zcode-job`): obvious, definitely non-sensitive work in public repos. Coding and coding-adjacent only:
     code, tests, GitHub automation and workflows, code reviews. Open-internet research needs a separate untrusted, internet-open container.
     The output is a ready PR labelled `human:review`. Leak-scan it before merge. Never auto-merge it.
   - Codex Luna: anything even remotely sensitive, or any private repo. Luna `xhigh` default, `max` as needed.
     Codex qualifies while `codex-quota` exits 0 (more than 5% left). Never Terra.
     Complicated bulk and mandatory auth, secrets, router, memory and cluster topics take `max` and name `[class: bulk-complex]`.
2. Other subscriptions where they fit, e.g. OpenCode Go (`zcode-job --tool opencode`) and Z.ai GLM. Public work only.
3. Haiku `xhigh`, the last resort, only after rungs 1 and 2 are exhausted or do not qualify; even then Haiku runs before the orchestrator works solo.

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
installed-plugin registry. Missing definitions stop dispatch. A Codex failure
while quota is available stops routing. An unknown quota status also stops
routing rather than treating an error as exhaustion.

For sandbox coding, put `[task: code] [repo: owner/repository]` in the
description. A public-repo tag alone does not establish that work is coding.
The sandbox takes public repositories only; a private repository stays with
Codex Luna. The hook verifies the returned PR belongs to the requested
repository, is open and non-draft, and has `human:review`. A job with no PR or
an unverifiable PR fails the handoff; inspect a dispatched job before retrying.
The hook never merges. Leak-scan the exact PR head before any human merge.

The GLM and OpenCode Go rungs use the existing router chat transport. Configure
`AGENT_ROUTE_GLM_MODEL` and `AGENT_ROUTE_OPENCODE_GO_MODEL` with the approved
model identifiers for those routes. Use `LLM_ROUTER_URL` with
`LLM_ROUTER_TOKEN_FILE`, or `LITELLM_LOCAL_BASE_URL` for the local proxy.
An unconfigured or unavailable route does not qualify. Mark self-contained text
work with `[class: text]` in the description to qualify for these chat transports.
Supply all required text in the prompt. Work requiring repository access, edits,
tests or other tools continues to a tool-capable executor. Coding tags, custom
agents, `Explore`, `Plan` and isolated tasks do not qualify for chat transports.
There is no generic small-model executor rung.

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
