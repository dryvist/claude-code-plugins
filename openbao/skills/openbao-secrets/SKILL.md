---
name: openbao-secrets
description: "How to obtain and handle secrets under an OpenBao-backed model: pick the store tier, prefer engine-minted ephemeral creds over static, read pre-authorized, route write/apply via the human-gated secret_id. Use before fetching/wiring a credential."
license: Apache-2.0
metadata:
  version: 1.0.0
  author: dryvist homelab
  hermes:
    category: security
    tags:
      - openbao
      - secrets
      - credentials
      - approle
    related_skills:
      - native-first
---

# OpenBao Secrets Access

How to get a credential without creating a standing one, and how to handle it once
you have it. Two rules carry most of the weight: **mint, don't store**, and
**reading is pre-authorized, writing is gated**.

## Agent quickstart

The fast path for a read, in order:

1. **Log in** with the ambient AppRole (secret-zero arrives from the run-wrapper,
   never hand-typed):

   ```bash
   token=$(bao write -field=token auth/approle/login \
     role_id="$ROLE_ID" secret_id="$SECRET_ID")
   ```

2. **Read** the value from the KV path you need:

   ```bash
   value=$(BAO_TOKEN="$token" bao kv get -field=<key> <mount>/<path>)
   ```

3. **Pick the mount by reachability, not habit.** Two KV mounts share identical
   sub-paths: `secrets-external/` for anything reachable from the public
   internet (a SaaS API key, a third-party webhook secret), `secret/` for
   everything internal-only. Only the mount changes, never the path shape.

4. **Prefer an engine over a KV copy.** GitHub, AWS, and Slack already mint
   short-lived credentials on demand — read from the engine (an installation
   token, an STS session, an OAuth-app token) and never keep a static copy of
   what it can mint.

5. **Never print the value.** Capture it into a variable and use the variable —
   no `echo`, no `curl -v`, no dumping the environment to check it landed.

6. **A helper that exits 0 having exported nothing is the bug, not a quiet
   success.** If a credential-fetch wrapper reports success but the variable
   it was supposed to set is empty, report that as a defect — never work
   around it by hand-typing the value instead.

> **State warning**: which engines are configured differs per environment and
> changes over time. Verify capability before relying on it (below) — never assume
> an engine is live because a config flag says enabled. A default is not a running
> system.

## Step 0: Which identity am I?

Every later step depends on *who is asking*. Answer this before touching a
store. Three identities exist, and they are not interchangeable:

| Identity | What it is | May do |
| --- | --- | --- |
| **Trusted automation identity** | A dedicated non-human principal the automation runs as, with its own login credential and its own policy | Pre-authorized reads; the gated writes its policy allows; the only identity that may hold unattended privilege |
| **Interactive operator** | A person at a terminal, authenticating as themselves | Pre-authorized reads; performs the human gate that authorizes a write |
| **Untrusted harness** | Any agent or tool session that has not been separated onto the automation identity — it borrows whoever launched it | Pre-authorized reads only; no writes, no unattended privilege |

Rules that follow from the table:

- **Reads are pre-authorized for all three.** Fetching a secret you are entitled
  to needs no ceremony regardless of identity.
- **A gated write happens under the trusted automation identity**, authorized by
  the interactive operator's gate (Step 3). An untrusted harness never writes,
  and never obtains a credential that would let it.
- **Unattended privilege — a credential that acts with no human present — exists
  only under the automation identity.** If you cannot name which identity you
  are, you are the untrusted harness; act accordingly.
- **Before any live write, confirm both facts from the store, not from memory**:
  which identity the current token belongs to (`auth/token/lookup-self`) and the
  exact capability on the exact path (`sys/capabilities-self`).
- **A read-tier AppRole cannot list roles or policies.** An inventory of what
  exists needs the admin identity; an empty list from a read tier is a permission
  result, not evidence that nothing is there.

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
| A bootstrap-store copy of a value already migrated to the central store | nothing — delete it once a live consumer is proven against the central store | leaving both copies live |

**Rotating an engine's root credential does not revoke the bootstrap key.** A
key created separately to configure the engine survives `aws/config/rotate-root`
and its equivalents. Delete it at its source provider, and probe it to confirm it
is dead, before removing the rows that reference it.

**If the engine for a resource is not configured in this environment, that need is
blocked — it is not a licence to seed a static secret.** "The engine isn't ready
yet" is precisely the moment the violation happens. Surface the gap; do not route
around it.

## Step 2: Pick the store tier

Match the secret to the tier that owns it, then stop — one secret, one home:

- **At-rest in-repo, encrypted** — for values a repo must carry (SOPS + age).
- **Runtime injection** — ambient environment for a process (a secrets manager
  run-wrapper). It supplies **secret-zero only**: the central store's address and
  the identity's login pair. Every other value resolves from the central store at
  run time. A second secret in the run-wrapper is a value that escaped the store.
  A migration off a run-wrapper row ends when that row is deleted, after a live
  consumer is proven working with the value absent.
- **Central secrets store (OpenBao)** — the source of truth for shared/service
  credentials, and the only place engines mint from.
- **Human vault** — credentials only a person uses interactively.

**The injection layer, not the IaC, is where a secrets manager is chosen.**
Playbooks and Terraform/OpenTofu read plain environment variables, so any
injector behaves identically and swapping one changes no infrastructure code.

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
