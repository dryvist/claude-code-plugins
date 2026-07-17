---
name: openbao-secrets
description: "How to obtain and handle secrets under an OpenBao-backed access model: pick the right store tier, prefer engine-minted ephemeral credentials over static secrets, read with the pre-authorized tier, and route write/apply through the human-gated wrapped single-use secret_id. Use before fetching any credential, wiring a service to a secret, converging a publisher, or when tempted to paste a token — and whenever a task needs a credential and you are unsure whether you may just take it."
---

# OpenBao Secrets Access

How to get a credential without creating a standing one, and how to handle it once
you have it. Two rules carry most of the weight: **mint, don't store**, and
**reading is pre-authorized, writing is gated**.

> **State warning**: which engines are configured differs per environment and
> changes over time. Verify capability before relying on it (below) — never assume
> an engine is live because a config flag says enabled. A default is not a running
> system.

## Step 1: Does this credential need to exist at all?

If a secrets **engine** can mint the credential, that engine is the only correct
source. An engine-minted credential is short-lived, attributable to the run that
asked for it, revocable by lease, and cannot leak durably. A static credential is
the opposite on all four counts.

| Need | Correct source | Never |
| --- | --- | --- |
| A GitHub token | `github/token/<permission_set>` (App installation token) | a stored PAT |
| AWS credentials | `aws/sts/<role>` | a static access key |
| Anything else an engine covers | that engine | a KV copy of it |
| A value nothing can mint (third-party API key, app config, bootstrap material) | KV — that is KV's whole job | — |

**If the engine for a resource is not configured in this environment, that need is
blocked — it is not a licence to seed a static secret.** "The engine isn't ready
yet" is precisely the moment the violation happens. Surface the gap; do not route
around it.

## Step 2: Pick the store tier

Match the secret to the tier that owns it, then stop — one secret, one home:

- **At-rest in-repo, encrypted** — for values a repo must carry (SOPS + age).
- **Runtime injection** — ambient environment for a process (a secrets manager
  run-wrapper). This is how a workload receives its bootstrap.
- **Central secrets store (OpenBao)** — the source of truth for shared/service
  credentials, and the only place engines mint from.
- **Human vault** — credentials only a person uses interactively.

**Generate at the source; promote later.** A new credential is generated (random,
idempotent, generate-if-absent) at the least-shared tier where it is first used.
It is promoted to the shared store only once a *second* consumer genuinely needs
it — never seeded there "just in case."

## Step 3: Authenticate — read vs write

The access model splits on intent, and the split is the security boundary:

| Intent | Secret-zero | Gate |
| --- | --- | --- |
| **Read** (fetch a secret, mint from an engine you are entitled to) | ambient — injected into the environment by the run-wrapper | **none — reading is pre-authorized** |
| **Write / apply** (write a secret, converge a publisher, elevated mint) | a **response-wrapped, single-use `secret_id`** a human generates for this one operation | **the wrap step IS the human checkpoint** |

So: reads are frictionless by design. Writes are not, and the friction is the
point — a human wrapping one single-use `secret_id` is the approval. Never try to
obtain a standing elevated credential to skip that step; that converts a gated
action into an ambient one.

## Step 4: Verify capability before you act

Before converging anything that *writes* a secret, confirm you actually hold the
capability on the exact path — do not discover it from a half-applied converge:

```bash
bao write sys/capabilities-self paths="the/exact/path"
```

Check the path you will really write, not its parent. A converge that fails
halfway through a publisher is worse than one that never started.

## Handling rules (non-negotiable)

- **Never echo a token.** Capture to a shell variable and reuse it. No `echo`, no
  writing it to a file, no `.env`, no temp file.
- **Never `curl -v`** with a token — verbose mode bleeds the header into the
  transcript. Use `curl -sSL` (`-sS` shows real errors; `-L` follows HA redirects).
- **Fetch once per session, reuse the variable.** Every fetch can cost an
  interactive prompt or a lease.
- **Never dump the environment** (`env`, `printenv`) — even filtered. Test one
  variable: `[[ -n "$VAR" ]]`.
- **No secret value in any transcript, commit, PR, issue, or doc.** Reference
  where a value lives, never the value. Describe a scrub by category, never as a
  real-value → placeholder mapping.
- **Never hand-type a credential into a shared store.** See generate-at-source.

## Related

- **native-first** (script-guards) — the discovery ladder; use it before building
  any bespoke credential plumbing.
- Environment-specific detail (which engines are live, mount paths, role names,
  runbooks) belongs in your own operations docs, not here — this skill is the
  model, not the inventory.
