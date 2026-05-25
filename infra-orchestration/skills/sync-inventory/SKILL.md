---
name: sync-inventory
description: Export Terraform inventory and distribute to Ansible repositories
---

# Infrastructure Sync Inventory

Export Terraform outputs as Ansible inventory and distribute the generated inventory files to all Ansible repositories.

## What It Does

1. Runs `terragrunt output -json ansible_inventory` in terraform-proxmox
2. Transforms the JSON output into Ansible-compatible inventory format
3. Copies the inventory to each Ansible repository that needs it

## Steps

### 1. Export Terraform Inventory

```bash
cd ${GIT_HOME_PUBLIC}/terraform-proxmox/main
doppler run -- terragrunt output -json ansible_inventory
```

### 2. Transform Output

Convert Terraform JSON output to Ansible inventory YAML format with host groups, variables, and connection details.

### 3. Distribute to Ansible Repos

Copy the generated inventory to:

- `${GIT_HOME_PUBLIC}/ansible-proxmox/main/inventory/`
- `${GIT_HOME_PUBLIC}/ansible-proxmox-apps/main/inventory/`
- `${GIT_HOME_PUBLIC}/ansible-splunk/main/inventory/`

### 4. Validate

Run `ansible-inventory --list -i inventory/hosts.yml` in each target repo to confirm the inventory is valid.

## Prerequisites

- Terraform state must exist (run `terragrunt apply` first)
- Doppler configured with `iac-conf-mgmt` project
- All target Ansible repos must be checked out at `${GIT_HOME_PUBLIC}/<repo>/main/`

## Error Handling

- If terraform output fails, report the error and stop
- If any Ansible repo is missing, skip it and warn
- If inventory validation fails, report which repo failed

## Related Skills

- **orchestrate-infra** (infra-orchestration) — Master orchestrator for cross-repo infrastructure with dependency graph dispatch
- **test-e2e** (infra-orchestration) — End-to-end infrastructure pipeline validation across Terraform and Ansible repos
- **infrastructure-standards** (infra-standards) — Use when working on infrastructure repos (terraform, ansible, kubernetes, proxmox, nix devShells)
