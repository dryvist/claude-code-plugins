---
name: sync-inventory
description: Verify or refresh the Terraform-to-Ansible inventory distribution (S3-published; apply is the publish boundary)
---

# Infrastructure Sync Inventory

The inventory pipeline is **automatic**: every terraform-proxmox
`terragrunt apply` natively publishes the `ansible_inventory` output to the
versioned S3 state bucket (`inventory_publish.tf`, `aws_s3_object`), and the
apply's after-hook (`scripts/sync-inventory.sh`) validates it against the
schema, PRs a versioned mirror into the private data repo (gated on
`INVENTORY_DATA_REPO`), and warms the local gitignored
`inventory/tofu_inventory.json` cache in each consumer repo.

Consumers (`ansible-proxmox`, `ansible-proxmox-apps`, `ansible-splunk`) resolve
identically via their `load_tofu.yml`:

1. `TOFU_INVENTORY_PATH` — explicit pin (tests/overrides)
2. **S3 artifact** — native `amazon.aws` fetch; AWS read creds only, no
   checkout, no toolchain (`TOFU_INVENTORY_S3_URI` / `TOFU_INVENTORY_S3_REGION`
   override location/region)
3. Local cache — the after-hook copy

**There is no manual export/transform/copy flow.** Never run
`terragrunt output -json ansible_inventory > <consumer>/inventory/...` by hand —
hand-injected inventories bypass the schema gate and create unmanaged drift.

## When invoked, do this

### 1. Verify the published artifact is current

```bash
aws s3api head-object \
  --bucket "terraform-proxmox-state-useast2-<account-id>" \
  --key terraform-proxmox/inventory/ansible_inventory.json \
  --query LastModified
```

If it predates the last intended infrastructure change, the publish boundary
was not crossed — run a real apply (next step). Reference docs:
`terraform-proxmox/docs/INVENTORY_PUBLISHING.md`.

### 2. Refresh = apply

The only way to republish is the publish boundary itself:

```bash
cd ${GIT_HOME_PUBLIC}/terraform-proxmox/main
aws-vault exec tf-proxmox -- doppler run -- terragrunt apply
```

The apply updates the S3 object (only when content changed) and the after-hook
re-warms every local cache and refreshes the int_homelab mirror PR.

### 3. Validate consumers resolve

In any consumer repo (no creds needed if the cache exists):

```bash
ansible-playbook <load_tofu path> -i inventory/hosts.yml -c local
```

- ansible-proxmox: `playbooks/load_tofu.yml`
- ansible-proxmox-apps / ansible-splunk: `inventory/load_tofu.yml`

Watch which resolution step wins ("Resolve inventory from …" task output).

## Error Handling

- Schema-gate failure in the after-hook → the source output is partial
  (e.g. a `-target` apply); fix the apply, never hand-edit the artifact.
- S3 fetch fails for a consumer → it degrades to the local cache by design;
  give the runner scoped `s3:GetObject` creds to restore the cloud path.
- Missing local cache + no creds → set `TOFU_INVENTORY_PATH` to a known-good
  copy, or run the apply.

## Related Skills

- **orchestrate-infra** (infra-orchestration) — Master orchestrator for cross-repo infrastructure with dependency graph dispatch
- **test-e2e** (infra-orchestration) — End-to-end infrastructure pipeline validation across Terraform and Ansible repos
- **infrastructure-standards** (infra-standards) — Use when working on infrastructure repos (terraform, ansible, kubernetes, proxmox, nix devShells)
