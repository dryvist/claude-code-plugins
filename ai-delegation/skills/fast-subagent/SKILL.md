---
name: fast-subagent
description: Use whenever a step of your work is routine and checkable — summarize, extract, classify, reformat, draft boilerplate, reduce command output, a first pass over a file — and keep using it for every such step through the whole session. One command sends the step to the shared router's fast-subagent role (`fast`, alias `subagent`) and the router decides which backend answers and the fallback order, so nothing here needs redeploying when the ranking changes. Names no model ids; runs on shell, curl and jq in any harness.
license: MIT
metadata:
  version: 1.0.0
  author: dryvist homelab
  hermes:
    category: research
    tags:
      - delegation
      - routing
      - cost
      - local
    related_skills:
      - local-subagents
      - premium-agent-orchestration
---

# fast-subagent

Doctrine: `local-subagents` (same plugin) says *why* and *what* to delegate and
how a busy single-slot tier behaves. This skill is the one-command *how*, tuned
for reuse: call it early, call it often, call it again.

## 1. When — every routine step, all session long

The Delegate column of `local-subagents` §1 is the list. The habit this skill
adds: **do not decide once**. Each time a new routine step appears — the fifth
log to reduce, the third file to summarize, the test output to read — send it
the same way. Repeated calls from one harness keep the backend's prompt cache
warm and the lock held, so the tenth call is cheaper than the first.

Keep for yourself: intent, architecture, tradeoffs, risk, anything you would
not accept from a smaller model without checking. Never send secrets, secret
store context, private topology, or personal data.

## 2. How — one command

```sh
printf '%s\n' "$INSTRUCTION" "$INPUT" | fast-subagent.sh
```

`fast-subagent.sh` lives in this skill's `scripts/` directory (resolve it
relative to this file; it needs only `bash`, `curl`, `jq`). It reads the
endpoint from the environment — `LLM_ROUTER_URL` + `LLM_ROUTER_TOKEN_FILE`, or
the local proxy's `OPENAI_API_BASE_URL` + `LITELLM_LOCAL_KEY` — sends one
bounded request for role `fast`, prints the answer on stdout and
`model=<what answered> fallbacks=<n>` on stderr.

Options: `--model subagent` (the alias), `--system TEXT`, `--max-tokens N`,
`--timeout SEC`, `--raw` (full JSON), `--release` (see §4).

Write the prompt for a small model — short imperatives, an explicit output
shape, a row cap, a hard STOP:

```text
Extract every failing test from the input. Do not explain or fix.
Output ONLY: test name | file | first error line. At most 40 rows. STOP.
```

Send only what the step needs. A call that carries your whole transcript costs
more than doing the step yourself.

## 3. What the router decides, not you

`fast` is a role whose target and fallback order live in the router's own
database and are edited in its admin UI — the operator can reorder or retarget
the chain at any time without a converge, a rebuild, or a change to this skill.
So: never name a physical model, never assume which backend answered, and read
`model=` on stderr when it matters. `fallbacks=1` or more means the first rung
was busy and the router moved on; that is the chain working, not an error.

## 4. When it says no

| Exit | Meaning | Do |
| --- | --- | --- |
| 2 | No endpoint in the environment | Do the step yourself and say so. Do not look for a provider key. |
| 3 | `401`/`403` | Report it. Never retry with a different credential. |
| 4 | Still busy after one `Retry-After` wait | Do the step yourself or pick another entry from `local-subagents` §3, and say which. Do not loop. |
| 5 | Transport or request failure | Report the message; a `400` naming an unknown model means the role is not seeded on this router yet. |
| 7 | `200` but no text (budget spent on reasoning, `finish_reason=length`) | Retry once with a higher `--max-tokens`; never treat empty output as an answer. |

`--release` on your **last** call of a burst frees the single-slot backend for
the next caller instead of waiting for the lock's own timeout. It is a
courtesy: the timeout is what guarantees release, so never depend on it.

## 5. Report what you used

Name the role and, when the reader needs it, the `model=` line, for each
delegated result. Say when you fell back to doing the step yourself.

## Related skills

- **local-subagents** (ai-delegation) — the full delegation doctrine, the live
  model menu, the fast-subagent tier contract.
- **premium-agent-orchestration** (ai-delegation) — which decisions a premium
  session keeps.
- **delegate-to-ai** (ai-delegation) — routing to another harness or CLI.
