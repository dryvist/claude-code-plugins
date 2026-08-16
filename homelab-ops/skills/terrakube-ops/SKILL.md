---
name: terrakube-ops
description: Operate self-hosted Terrakube (remote OpenTofu/Terraform plan/apply, state, and workspace locking) — the canonical login/plan/apply workflow, why a targeted apply is dangerous, workspace lock recovery, the offline-mirror gotcha, and the token-rotation trap. Use when running or observing a Terrakube plan/apply, recovering a stuck workspace lock, or standing up a new workspace against Terrakube.
---

# Terrakube operations

[Terrakube](https://terrakube.io) is a self-hosted remote-execution platform
for OpenTofu/Terraform — plans and applies run on its own executor, not on
the operator's machine or in CI. This skill is the generic operating model;
your own workspace names, hostnames, and credential source stay in your own
inventory.

## Canonical workflow

```bash
tofu login <terrakube-hostname>   # once per machine — opens a browser SSO flow
tofu plan                         # runs remotely; CLI streams the live plan log
tofu apply                        # same remote workspace, same run
tofu state list                   # inspect state / outputs afterward
tofu output
```

`tofu plan`/`apply` from the CLI and starting a run from the Terrakube web UI
both drive the same remote executor and the same job log — pick whichever is
convenient; they're interchangeable.

> Local `tofu init -backend=false` + `tofu validate` catches syntax errors
> without contacting any provider — run that first, it's free and instant
> compared to a remote plan.

## Never use a targeted apply

A targeted apply (`-target=...`) can leave the real infrastructure and any
downstream-published inventory describing two different worlds — whatever
consumes that inventory (configuration management, DNS, monitoring) now
disagrees with reality. Apply the reviewed **whole-workspace** plan. For
state surgery, prefer `moved`/`removed` blocks over `-target` or manual state
edits.

## Workspace locking and recovery

Terrakube owns one run queue and one lock per workspace — a second run simply
queues behind the active one; independent workspaces don't share a lock.

- Cancel a genuinely stuck run from the workspace UI, not by force-unlocking
  blind.
- Confirm the executor has actually stopped before force-cancelling or
  unlocking — cancelling a run that's still writing state is how corruption
  happens.
- Prefer fixing forward (revert the config change in git, plan/apply again)
  over restoring an older state version. When state genuinely is corrupted,
  preserve the *current* state version before restoring an older one — you
  may need to diff them later.

## The offline-mirror gotcha

An executor eagerly initializes its Terraform-compatible provider downloader
even on a workspace that only ever runs **OpenTofu**. If your platform points
release/provider resolution at an internal mirror for offline operation,
**both** the Terraform-compatibility URL and the OpenTofu release URL need to
point at that mirror — leaving either one pointed at a public release service
reintroduces an internet dependency and breaks offline recovery exactly when
you need it not to.

## Token rotation invalidates every session

Rotating whatever secret Terrakube uses to sign its own issued tokens (a
`PAT_SECRET`/`INTERNAL_SECRET`-style value) invalidates **every** previously
issued personal access token at once. Plan for a `tofu login` re-auth on
every machine that touches the platform right after that rotation — it isn't
a sign anything else is broken.

## Verification

1. The run reaches `applied` (CLI exits 0; UI shows a green Applied state).
2. `tofu output` reflects the expected values.
3. Re-running `tofu plan` immediately after a clean apply reports "No
   changes" — if it doesn't, something outside the applied config drifted,
   or the apply didn't fully land.

## Related

- **proxmox-cluster-ops** (this plugin) — the guest-level operations this
  IaC layer should be the only thing changing.
- **infrastructure-standards** (infra-standards) — the inventory contract a
  producer workspace's outputs typically feed.
