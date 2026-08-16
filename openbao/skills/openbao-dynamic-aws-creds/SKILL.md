---
name: openbao-dynamic-aws-creds
description: "Replace a static AWS access key on a workstation or CI runner with short-lived STS credentials minted on demand by OpenBao's (or Vault's) AWS secrets engine, via an AWS credential_process wrapper. Covers the architecture, bring-up order, verification, plugin-upgrade caution, and common failure modes. Use when a workstation profile still holds a static AWS key, when setting up dynamic AWS credentials for infra-as-code tooling, or when diagnosing a credential_process failure."
---

# Dynamic AWS credentials from a central secrets engine

A workstation or CI runner never needs to hold a static AWS access key. The
AWS secrets engine (`assumed_role` type) keeps one long-lived base-user key
server-side inside the secrets store, and mints short-lived STS sessions for
a target role on demand. The consumer picks these up through AWS's own
`credential_process` mechanism — no key on disk, no key to rotate on the
consumer side. A leaked workstation credential under this model is a
non-event: it expires on its own within the hour.

## Architecture

```text
~/.aws/config  [profile <name>]
  credential_process = <your-wrapper> <name>
        │  reads AppRole secret-zero (role_id/secret_id + the secrets-store
        │  address) from the ambient environment
        ▼
secrets-store  aws/sts/<name> ── sts:AssumeRole ──▶ role/<name>
  root = the base-user key (engine config, seeded once from your top secret
          tier — never committed, never in a workspace variable)
  returns AccessKeyId / SecretAccessKey / SessionToken, short TTL
```

Secret-zero — the AppRole credentials the wrapper needs just to *authenticate
to the engine* — lives only in your highest-trust secret tier and reaches the
wrapper as ambient environment (a run-wrapper like `doppler run` or
equivalent): run your IaC tool under that wrapper, and the `credential_process`
child process inherits the environment. Nothing is stored in a local keychain
or `.env` file.

## Where each piece lives (generic shape)

| Piece | Owns |
| --- | --- |
| Engine mount + role + RBAC | Stages the AWS-engine plugin, mounts it, writes the root config (write-once) and the target role, grants the calling AppRole read+update on `aws/sts/<name>` and nothing else |
| `credential_process` wrapper | A small binary/script: reads secret-zero from the ambient env, authenticates to the engine, caches the STS response locally (mode 0600), refreshes proactively before expiry |
| `~/.aws/config` profile | Points the named profile's `credential_process` at the wrapper instead of a static key or a `source_profile`/`role_arn` chain |

If your secrets platform is a Vault-lineage engine that dropped the AWS
plugin from core at some point (OpenBao did, at the fork point from Vault),
the engine is an **external plugin**: stage the prebuilt binary
(checksum-verified) onto every relevant node, set the plugin directory, and
register it sha256-pinned. A bare "enable the aws engine" on a stock install
without that staging step fails.

## Bring-up (one-time)

1. **Mint the base-user AWS key via your own IAM bootstrap process** — never
   reuse the key being retired for this migration. The base user needs only
   `sts:AssumeRole`; the target role's trust policy should already allow the
   assumption (a static-key workflow used the same relationship).
2. **Seed your top secret tier**: the engine's root key pair, plus the
   wrapper's own secret-zero (the secrets-store address and the calling
   AppRole's `role_id`/`secret_id`).
3. **Converge/apply the engine config** with an admin token. Make the root
   config **write-once**: if the engine is mounted but unconfigured and the
   seed values are missing, the apply should fail loudly rather than leaving
   a half-configured engine; if already configured, a routine re-apply should
   never silently rotate it.
4. **Deploy the wrapper** and regenerate `~/.aws/config` to point the profile
   at it.
5. **Verify** (below), then remove the old static key from wherever it was
   stored. Nothing static should remain on the consumer.

## Verify

```bash
# Server side, admin token
bao read aws/roles/<name>          # confirm assumed_role type, TTL
bao read aws/sts/<name>            # returns live STS creds

# Workstation, under the run-wrapper that injects secret-zero
<run-wrapper> aws --profile <name> sts get-caller-identity  # arn ...assumed-role/<name>/...
```

## Plugin upgrade

Treat an engine plugin version bump like root-key rotation: deliberately
manual. Bump the pinned version, converge (stages the new binary on every
node), re-register with the new checksum, and reload the plugin — don't
let this happen implicitly on a routine converge.

## Failure modes

- **Wrapper dies complaining secret-zero isn't in the environment** — run the
  command under the run-wrapper that injects it; a raw shell invocation
  won't have it.
- **STS read fails after a cluster restore** — if the engine's config
  replicates via consensus and the mount exists but the root-config read
  fails post-restore, re-seed it from your top secret tier rather than
  assuming the engine is broken.
- **A single long-running apply outlives the STS TTL** — the wrapper
  refreshes proactively on each invocation, but one long-lived SDK client
  caches its credentials for its own process lifetime. If a legitimate apply
  regularly runs long enough to hit this, raise the role's default/max TTL
  rather than fighting the client's cache.

## Related

- **openbao-secrets** (this plugin) — the general mint-don't-store /
  read-vs-write access model this pattern is a concrete instance of.
