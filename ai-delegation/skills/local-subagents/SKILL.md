---
name: local-subagents
description: Use when any step of your work is bulk reading, summarizing, classifying, extracting, drafting boilerplate, or a first pass over unfamiliar code — hand it to a locally served or cheap model through the shared router instead of spending your own context on it. Covers when to delegate, how to read the live model menu (speed, quality, best-for, context, price) from the router's own contract, how to bound the call, and what to do when the router says no. Names no model ids; runs on shell, curl and jq in any harness.
license: MIT
metadata:
  version: 1.0.0
  author: dryvist homelab
  hermes:
    category: research
    tags:
      - delegation
      - routing
      - models
      - cost
      - local
    related_skills:
      - openrouter-models
      - premium-agent-orchestration
---

# local-subagents

Doctrine: `prompt://dryvist/auto-ai-agent/model-delegation`. This skill is how
you act on it — when to hand work out, how to find out what is serving right
now, and how to place the call.

Your own inference is the scarcest and most expensive thing in the session.
The estate runs models that cost nothing per token and sit idle most of the
day. Anything they can do, they should do.

## 1. When to delegate — the default is yes

Delegate a step when its result can be **checked from concrete evidence**:

| Delegate | Keep |
| --- | --- |
| Summarizing a file, log, transcript, or diff | What the user actually wants |
| Classifying or triaging a batch | Architecture and design choices |
| Extracting structured fields into a schema | Tradeoffs, risk, security judgment |
| A first pass over unfamiliar code ("where is X handled") | Resolving contradictory evidence |
| Drafting boilerplate, tests, config from a stated pattern | Reviewing anything risky |
| Reading and reducing command or test output | The final answer to the user |
| A single, scoped code edit with the pattern already decided | Deciding the pattern |

Two rules that keep this honest:

- **Split the job; never escalate the whole job.** One hard step inside a task
  does not make the task premium work. Delegate the other eight steps.
- **Capable judges the subtask, not the parent task.** A 9B model summarizing
  a log is the right tool even inside a hard architectural task.

**Never delegated, at any tier:** secrets and credentials, secret-store
context, private infrastructure topology (hosts, addresses, what depends on
what), personal data, and anything a free-tier entry's caveat forbids. Those
stay with you or go to a local entry only.

## 2. Read your endpoint from the environment

The router is an OpenAI-compatible endpoint. Its base URL and credential
arrive as environment variables whose names are set by whatever provisioned
the session — read them, never assume:

```sh
env | grep -iE 'router|litellm|openai_(base|api)' | sed 's/=.*/=<set>/'
```

A credential may arrive as a **file path** rather than a value; read the file
at the moment of the call and keep it in a variable, never export it.

No endpoint variable means the router is not wired into this session. Say so
and do the work yourself. Do not go looking for a provider key — you hold
none, and acquiring one replaces a central budget with an unmetered one.

## 3. Fetch the live menu — never hardcode a model name

Inventories change far faster than this skill. Fetch:

```sh
curl -fsS --max-time 10 -H "Authorization: Bearer $ROUTER_KEY" \
  "$ROUTER_BASE/model/info" > menu.json
```

Render the menu you will choose from. Entries may publish a `hints` map
(`speed`, `quality`, `best_for`, `caveats`, `measured`) — the registry's own
description of each model, which is why this skill needs no model names:

```sh
jq -r '.data[] | [ .model_name,
    (.model_info.hints.speed // "?"), (.model_info.hints.quality // "?"),
    ((.model_info.hints.best_for // []) | join("/")),
    (.model_info.max_input_tokens // 0 | tostring),
    (if (.model_info.input_cost_per_token // 0) == 0 then "free" else "paid" end),
    ((.model_info.hints.caveats // []) | join(","))
  ] | @tsv' menu.json | sort -k6,6 -k2,2
```

`$ROUTER_BASE` is expected to already include the API version. If the variable
you found does not, add the version segment before appending these paths.
Fallback listing when `/model/info` is unavailable: `GET /models` gives ids
only, no hints — say so if you choose from it. More recipes:
[references/menu.md](references/menu.md).

## 4. Choose

1. **Prefer a role alias over a physical id.** An alias (`cheap`, `judge`,
   `subagent`, and whatever else the menu shows) is the part promised to keep
   working when the model behind it changes.
2. **Match `best_for` to the subtask**, not to the parent task.
3. **Free before paid, then fastest.** Take the cheapest entry that can
   plausibly do this subtask; among equals prefer the higher `speed` class.
4. **Check the context window against your input** before sending. A router
   with pre-call checks refuses an oversized prompt outright rather than
   truncating it — that refusal is correct, and the fix is a smaller slice or
   an entry with a larger window, never a retry.
5. **Read the caveats.** They are measured failure modes: a model that only
   tool-calls reliably in one stream, one that needs specific sampling, one
   whose free tier retains prompts.
6. **Escalate one quality class at a time**, and only after a weaker tier
   actually fell short. Say that it did.

When no hints are published, fall back to cost and context alone, and say the
choice was made without them.

## 5. Call, bounded

```sh
curl -fsS --max-time 120 -H "Authorization: Bearer $ROUTER_KEY" \
  -H 'content-type: application/json' \
  -d @request.json "$ROUTER_BASE/chat/completions"
```

- **Every call gets a timeout.** A local model is slower than a hosted one;
  size the timeout from the entry's `speed` class, and treat a slow entry as
  slow, not hung.
- **Send only what the subtask needs.** A delegated call carrying your whole
  transcript costs more than doing the work yourself and widens what leaves
  the estate.
- **Write the prompt for a small model**: short imperatives, an explicit
  output schema, a row cap, and a hard STOP. Ask for extraction, never advice.

```text
Extract items from the input. Do not explain. Do not advise. Do not fix.
Output ONLY this table, one row per item:
  item | kind | state | evidence (line no, URL, or quote)
Rules:
1. Copy text verbatim. Never paraphrase an item.
2. Unknown field -> write UNKNOWN. Never guess.
3. At most 60 rows. STOP after the table.
```

- **Bound fan-out.** Many local backends serve one request at a time and
  refuse rather than queue. Two or three in flight, never an unbounded batch.

## 6. When the router says no

| What you see | What it means | What to do |
| --- | --- | --- |
| DNS failure, refused connection, timeout | Router unreachable | Report it; defer the subtask or do it yourself as a stated choice |
| `401` / `403` | Credential invalid or not scoped to that model | Report it; do not retry with a different credential |
| `429` | Backend busy — often a single-slot local model | Wait once and retry, or take another entry; see `openrouter-models` for budget refusals |
| `400` naming an unknown model | Your id is not served | Re-fetch the menu; do not retry the same id |
| A context-length refusal | Pre-call check working | Send a smaller slice or pick a larger-window entry |

None of these authorize a silent fallback. Absorbing the work back into your
own context without saying so is the exact cost the delegation was meant to
avoid, and it hides the failure from whoever pays for it. Never respond to any
of them by reaching for a provider credential.

## 7. Report what you used

Name the alias that produced each delegated result, and say when you chose
without hints, used the id-only listing, or did the work yourself because the
router was unreachable. A reader weighing your output needs to know which
parts came from a cheap tier.

## Related skills

- **openrouter-models** (ai-delegation) — the self-enforced spend budget for
  paid entries, the free-tier prompt-logging rule, and how to ask for a model
  the router does not serve.
- **premium-agent-orchestration** (ai-delegation) — which decisions a premium
  session keeps; this skill is how its delegations are placed.
- **delegate-to-ai** (ai-delegation) — routing to another harness or CLI
  rather than to a model behind the router.
