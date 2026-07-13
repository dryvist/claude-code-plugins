---
name: sync-inventory
description: Verify or refresh the OpenTofu-to-Ansible inventory distribution (RustFS-published; apply is the publish boundary)
---

# Infrastructure Sync Inventory

The inventory pipeline is **automatic**: every successful `tofu-proxmox`
Terrakube apply validates `ansible_inventory` in the OpenTofu graph and
publishes it to the homelab RustFS object store with `aws_s3_object`. There is
no post-apply hook or manual mirror step.

Consumers (`ansible-proxmox`, `ansible-proxmox-apps`, `ansible-splunk`) resolve
identically via their `load_tofu.yml`:

1. `TOFU_INVENTORY_PATH` — explicit pin (tests/overrides)
2. **RustFS artifact** — native `amazon.aws` fetch over the homelab network;
   scoped credentials come from OpenBao, with no IaC checkout or toolchain
3. Local cache — offline fallback only

**There is no manual export/transform/copy flow.** Never run
`tofu output -json ansible_inventory > <consumer>/inventory/...` by hand —
hand-injected inventories bypass the schema gate and create unmanaged drift.

## When invoked, do this

### 1. Verify the published artifact is current

```bash
aws s3api head-object \
  --endpoint-url "$RUSTFS_ENDPOINT" \
  --bucket "$TOFU_INVENTORY_BUCKET" \
  --key "$TOFU_INVENTORY_KEY" \
  --query LastModified
```

If it predates the last intended infrastructure change, the publish boundary
was not crossed — run a real apply (next step). Reference docs:
`tofu-proxmox/docs/INVENTORY_PUBLISHING.md`.

### 2. Refresh = apply

The only way to republish is the publish boundary itself:

```bash
cd ${GIT_HOME_PUBLIC}/homelab/tofu-proxmox/main
tofu apply
```

The command submits a remote Terrakube run. The workspace lock serializes
changes, Terrakube obtains its OpenBao credentials natively, and the apply
updates the RustFS object only when content changed.

### 3. Validate consumers resolve

In any consumer repo (no creds needed if the cache exists):

```bash
ansible-playbook <load_tofu path> -i inventory/hosts.yml -c local
```

- ansible-proxmox: `playbooks/load_tofu.yml`
- ansible-proxmox-apps / ansible-splunk: `inventory/load_tofu.yml`

Watch which resolution step wins ("Resolve inventory from …" task output).

## Error Handling

- Schema-gate failure in the OpenTofu graph → the source output is invalid;
  fix the configuration, never hand-edit the artifact.
- RustFS fetch fails for a consumer → it degrades to the local cache by design;
  restore homelab reachability or the consumer's scoped OpenBao policy.
- Missing local cache + no creds → set `TOFU_INVENTORY_PATH` to a known-good
  copy, or run the apply.

## Related Skills

- **orchestrate-infra** (infra-orchestration) — Master orchestrator for cross-repo infrastructure with dependency graph dispatch
- **test-e2e** (infra-orchestration) — End-to-end infrastructure pipeline validation across Terraform and Ansible repos
- **infrastructure-standards** (infra-standards) — Use when working on infrastructure repos (terraform, ansible, kubernetes, proxmox, nix devShells)
