---
name: orchestrate-infra
description: Master orchestrator for cross-repo infrastructure with dependency graph dispatch
---

# Infrastructure Orchestrator

Master orchestrator for cross-repo infrastructure operations. Manages the dependency graph
between Terraform and Ansible repositories and dispatches Task subagents for each phase.

## Dependency Graph

```text
terraform-proxmox
  -> ansible-proxmox (host configuration)
  -> ansible-proxmox-apps (application configuration)
     -> ansible-splunk (Splunk Enterprise)
```

Terraform provisions infrastructure first. Ansible configures it in dependency order.

## Supported Operations

### plan-all

Run `terragrunt plan` in terraform-proxmox, then `ansible-playbook --check` across all Ansible repos in dependency order.

### validate-all

Run `terragrunt validate` in terraform-proxmox, then `ansible-playbook --syntax-check` across all Ansible repos.

### sync-inventory

Export Terraform outputs as Ansible inventory and distribute to all Ansible repos. See `/infra-sync-inventory` for details.

### e2e-test

Full pipeline validation: validate, plan, export inventory, syntax-check, check, diff. See `/infra-e2e-test` for details.

## Execution Pattern

1. **Resolve repo paths**: locate each target repo locally
2. **Dispatch Terraform phase**: Launch subagent for terraform-proxmox operations
3. **Await completion**: Terraform must complete before Ansible phases
4. **Dispatch Ansible phases**: Launch parallel subagents for independent Ansible repos (invoke `superpowers:dispatching-parallel-agents`)
5. **Collect results**: Aggregate success/failure from all subagents
6. **Report**: Summary with per-repo status

## Secret Injection

All repos use Doppler for runtime secrets: `doppler run -- <command>`. Never hardcode credentials.

## Error Handling

If any phase fails, report the failure and stop dependent phases. Independent repos continue in parallel.

## Related Skills

- **sync-inventory** (infra-orchestration) — Export Terraform inventory and distribute to Ansible repositories
- **test-e2e** (infra-orchestration) — End-to-end infrastructure pipeline validation across Terraform and Ansible repos
- **infrastructure-standards** (infra-standards) — Use when working on infrastructure repos (terraform, ansible, kubernetes, proxmox, nix devShells)
