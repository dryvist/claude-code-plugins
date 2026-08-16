---
name: llm-router-ops
description: Operate a self-hosted OpenAI-compatible LLM router/proxy (e.g. LiteLLM) in front of one or more backends — the minimal client-wiring block for every client type, the context-window advertisement gotcha, the env-vs-persisted-config gotcha, and why an unauthenticated health probe should 401, not 200. Use when wiring a new client to a shared LLM router, adding a backend model, or diagnosing why a router-fronted client silently misbehaves.
---

# Operating an OpenAI-compatible LLM router

A self-hosted LLM router (e.g. LiteLLM) gives every consumer — human tool or
agent — one shared base URL and one shared bearer key, and load-balances or
routes to whichever backend actually serves a given model alias. This is the
generic client-wiring and operational-gotcha pattern; your own base URL,
model aliases, and key-storage location stay in your own inventory.

## Minimal client wiring

Every client type needs the same three things: base URL, bearer key, model
alias. The alias is what decouples a client from knowing which backend is
really serving it.

```bash
curl -s https://<router-host>/v1/chat/completions \
  -H "Authorization: Bearer $ROUTER_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "<alias>", "messages": [{"role": "user", "content": "hello"}]}'
```

```python
from openai import OpenAI
client = OpenAI(base_url="https://<router-host>/v1", api_key=os.environ["ROUTER_MASTER_KEY"])
```

Any tool with an "OpenAI-Compatible" or "OpenAI API" provider type (chat UIs,
low-code agent builders, Ansible-style role group vars) takes the same two
values — base URL and key — with no other client-specific config needed.

## Adding a backend model

1. Add the model block to the router config: alias name, backend model id,
   backend base URL.
2. **Set the context window explicitly** if the router doesn't already know
   the backend's real native context. An unrecognized backend id otherwise
   resolves to a `null`/unset advertised context, which starves any consumer
   that trusts the router's advertised limit to decide how much to send.
3. Restart/reload the router process so the new config takes effect.
4. Verify: `GET /v1/models` (with the bearer key) lists the new alias, and
   its advertised context window is the real one, not null.

## Gotcha: env var vs. the tool's own persisted config

Many chat-UI-style front ends persist their provider config in their own
database and will silently let that override the environment on a redeploy
— so a correct env var stops mattering after the UI's admin panel has ever
been touched. If the front end has a "persistent config" or equivalent
toggle, disable it so the **environment is authoritative** on every restart,
instead of the tool re-applying whatever was last saved in its UI.

## Gotcha: an unconditional import your dependency tree no longer pulls in

If the router's own error-classification path unconditionally imports an
optional dependency (a DB client, a metrics library) to decide whether a
failure is an outage vs. a plain auth rejection, and a version bump of the
router's package drops that dependency as a *transitive* pull, every
rejected or missing key starts returning a generic 500 instead of a 401 —
masking real auth failures as opaque server errors. If backend-classifier
logic in your router depends on an `import` succeeding for an `isinstance`
check, pin that package explicitly even though you never call it directly.

## Gotcha: anonymous probes should 401, not 200-with-an-error-body

If the router requires the bearer key on every route including
`/v1/models`, an unauthenticated health check will always see `401` — that
is correct and not a misconfiguration. Don't "fix" a monitoring probe by
loosening auth on the models endpoint; fix the probe to send the key.

## Verification

```bash
curl -s https://<router-host>/v1/models \
  -H "Authorization: Bearer $ROUTER_MASTER_KEY" | jq '.data[].id'
```

Every alias you expect is present, and each carries a non-null advertised
context window.

## Related

- **openbao-secrets** (openbao) — the pattern for sourcing the router's
  master key at runtime instead of storing it statically.
