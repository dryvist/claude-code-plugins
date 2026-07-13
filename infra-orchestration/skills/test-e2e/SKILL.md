---
name: test-e2e
description: End-to-end infrastructure pipeline validation across Terraform and Ansible repos
---

# Infrastructure End-to-End Test

Full pipeline validation across every infrastructure repo in dependency order.
Validates syntax, plans changes, exports inventory, and dry-runs Ansible playbooks.

## Pipeline Stages

### Stage 1: OpenTofu Validate

In `tofu-proxmox`:

```bash
tofu validate
```

### Stage 2: Terrakube Plan

In `tofu-proxmox`:

```bash
tofu plan
```

### Stage 3: Export Inventory

Run `/infra-sync-inventory` to verify the RustFS artifact produced by the last
successful Terrakube apply.

### Stage 4: Ansible Syntax Check

Run in parallel across all Ansible repos:

```bash
ansible-playbook --syntax-check -i inventory/hosts.yml playbooks/site.yml
```

Target repos: ansible-proxmox, ansible-proxmox-apps, ansible-splunk

### Stage 5: Ansible Check Mode (Dry Run)

Run in parallel across all Ansible repos:

```bash
ansible-playbook --check -i inventory/hosts.yml playbooks/site.yml
```

### Stage 6: Ansible Diff

Run in parallel across all Ansible repos:

```bash
ansible-playbook --check --diff -i inventory/hosts.yml playbooks/site.yml
```

## Results

Report per-stage, per-repo pass/fail status:

| Stage | tofu-proxmox | ansible-proxmox | ansible-proxmox-apps | ansible-splunk |
| --- | --- | --- | --- | --- |
| Validate | PASS/FAIL | - | - | - |
| Plan | PASS/FAIL | - | - | - |
| Syntax Check | - | PASS/FAIL | PASS/FAIL | PASS/FAIL |
| Check Mode | - | PASS/FAIL | PASS/FAIL | PASS/FAIL |
| Diff | - | PASS/FAIL | PASS/FAIL | PASS/FAIL |

## Error Handling

Stage failures in OpenTofu block all subsequent stages. Ansible stage failures are independent per-repo.

## Related Skills

- **orchestrate-infra** (infra-orchestration) — Master orchestrator for cross-repo infrastructure with dependency graph dispatch
- **sync-inventory** (infra-orchestration) — Export Terraform inventory and distribute to Ansible repositories
- **infrastructure-standards** (infra-standards) — Use when working on infrastructure repos (terraform, ansible, kubernetes, proxmox, nix devShells)
