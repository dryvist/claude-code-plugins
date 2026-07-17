# openbao

The OpenBao-backed secrets access model as a Claude Code skill: **mint, don't
store**, and **reading is pre-authorized, writing is gated**.

Most credential mistakes are not "the token leaked" — they are "a standing token
existed at all." This plugin encodes the alternative: obtain a short-lived
credential from a secrets engine at the moment of use, and treat writing a secret
as a human-approved act rather than an ambient capability.

## What it covers

- **Engine over storage** — if an engine can mint it (GitHub App installation
  tokens, AWS STS), that engine is the only correct source. KV is reserved for
  values nothing can mint.
- **Store tiers** — which of the four tiers owns a given secret, and the
  generate-at-source / promote-later rule.
- **Read vs write** — reads run on an ambient, pre-authorized secret-zero; writes
  and applies require a response-wrapped, single-use `secret_id` that a human
  generates for that one operation. The wrap step *is* the checkpoint.
- **Capability check** — confirm the exact path before converging a publisher.
- **Handling rules** — never echo a token, never `curl -v`, fetch once and reuse
  the variable, never dump the environment, no secret values in any artifact.

The skill is deliberately environment-agnostic. Which engines are configured,
mount paths, role names, and runbooks belong in your own operations docs — this
plugin is the model, not the inventory.

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/openbao
```

## Usage

No manual invocation required in most cases — the skill triggers when a task
involves obtaining or handling a credential. Invoke it explicitly with:

```text
/openbao-secrets
```

Reach for it before fetching any credential, wiring a service to a secret,
converging something that writes a secret, or whenever you are unsure whether a
credential may simply be taken.

## License

Apache-2.0
