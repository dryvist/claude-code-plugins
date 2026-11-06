---
name: delegation-ladder
description: Apply the executor ladder for the maintainer's own setup, including eligibility and verification rules.
---

# Delegation ladder

Route each delegated task to the first rung that qualifies. Check codex-quota first.

1. Codex, while codex-quota exits 0. Pick the model by class:
   - bulk, reads and triage: Luna `xhigh`.
   - bulk work that is still somewhat complicated: Luna `max`.
   - auth, secrets, router, memory and cluster work: Luna `max`. Name `[class: bulk-complex]` in the description.
   - standard implementation: Terra `medium`.
   - complex work, plan, and design or architecture review: Terra `high`.
   Never Terra above high, never Luna above max.
2. zcode-job sandbox, while Codex is capped. Coding tasks only. Public repos qualify. A private repo qualifies
   only when it has the repo property `ai-untrusted-ok=true` and its payload passes classification before
   dispatch. The output is a ready PR labelled `human:review`. Leak-scan it before merge. Never auto-merge it.
3. Z.ai GLM, then OpenCode Go, while Codex is capped.
4. Haiku `xhigh`, the last resort, only when rungs 1 to 3 do not qualify.

Never Sonnet, Opus or Fable subagents.
Never send secrets, credentials, inventory or incident content to any executor.

| Kind | Ladder | Sandbox eligibility | Use |
| --- | --- | --- | --- |
| `code` | Codex -> zcode-job sandbox -> Z.ai GLM -> OpenCode Go -> Haiku xhigh | Public coding tasks | Implementation |
| `private` | Codex -> zcode-job sandbox -> Z.ai GLM -> OpenCode Go -> Haiku xhigh | Coding, property true, payload classification passed | Private tasks |
| `other` | Codex -> Z.ai GLM -> OpenCode Go -> Haiku xhigh | Ineligible | Reads, triage, summaries, review and planning |

## Dispatch and completion

The lead classifies the full payload, including attachments, diffs, logs and
conversation context, before dispatch. Use placeholders in work about sensitive
systems. The hook screens inline payloads locally before calling any classifier
or executor; it cannot inspect attachments or files that workers might read.
The lead must keep prohibited content out of executor-accessible context.

Codex uses the newest listed model of the selected family in its local cache.
Plan, design and architecture review use the `plan` or `deep` class and a
read-only sandbox, as do `Explore` and `Plan` agents. Explicit class tags select
these routes; mandatory bulk-complex topics override model selection while
preserving an explicit `plan` or `deep` read-only sandbox.
Explicit models, named agents and worktree isolation cannot bypass the ladder.
Isolated Codex tasks get a detached worktree, whose path is returned for review.
Custom-agent instructions are preserved; namespaced plugin agents resolve from
the local installed-plugin registry. Missing definitions stop dispatch.
A Codex failure while quota is available stops routing. An unknown quota status
also stops routing rather than treating an error as exhaustion.

For sandbox coding, put `[task: code] [repo: owner/repository]` in the
description. A public-repo tag alone does not establish that work is coding.
For a private repository, also put `[payload: classified-safe]` in the
description only after the lead classifies the full payload. The hook reads the
repository property before dispatch, using the caller's existing GitHub CLI
identity when unauthenticated metadata is unavailable. It verifies the returned PR belongs to
the requested repository, is open and non-draft, and has `human:review`.
A job with no PR or an unverifiable PR fails the handoff; inspect a dispatched
job before retrying. The hook never merges. Leak-scan the exact PR head before
any human merge.

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
work even in public repos. For private sandbox eligibility, set
`AGENT_ROUTE_TASK=code`, `AGENT_ROUTE_REPO_AI_UNTRUSTED_OK=true` and
`AGENT_ROUTE_PAYLOAD_CLASSIFICATION=safe` only after checking the property and
classifying the payload. The helper reports a route; it does not dispatch or
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
