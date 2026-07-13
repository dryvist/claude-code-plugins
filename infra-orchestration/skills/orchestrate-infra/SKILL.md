---
name: orchestrate-infra
description: Master orchestrator for cross-repo infrastructure with dependency graph dispatch
---

# Infrastructure Orchestrator

Master orchestrator for cross-repo infrastructure operations. Manages the dependency graph
between Terraform and Ansible repositories and dispatches Task subagents for each phase.

## Dependency Graph

```text
tofu-proxmox
  -> ansible-proxmox (host configuration)
  -> ansible-proxmox-apps (application configuration)
     -> ansible-splunk (Splunk Enterprise)
```

OpenTofu provisions infrastructure first through Terrakube. Ansible configures it in dependency order.

## Supported Operations

### plan-all

Run `tofu plan` in the `tofu-proxmox` Terrakube workspace, then
`ansible-playbook --check` across all Ansible repos in dependency order.

### validate-all

Run `tofu validate` in tofu-proxmox, then `ansible-playbook --syntax-check`
across all Ansible repos.

### sync-inventory

Export Terraform outputs as Ansible inventory and distribute to all Ansible repos. See `/infra-sync-inventory` for details.

### e2e-test

Full pipeline validation: validate, plan, export inventory, syntax-check, check, diff. See `/infra-e2e-test` for details.

## Execution Pattern

1. **Resolve repo paths**: locate each target repo locally
2. **Dispatch OpenTofu phase**: Launch a subagent for tofu-proxmox operations
3. **Await completion**: OpenTofu must complete before Ansible phases
4. **Dispatch Ansible phases**: Launch parallel subagents for independent Ansible repos (invoke `superpowers:dispatching-parallel-agents`)
5. **Collect results**: Aggregate success/failure from all subagents
6. **Report**: Summary with per-repo status

## Secret Injection

Terrakube obtains short-lived OpenBao credentials through its native dynamic
provider credential flow. Ansible uses native OpenBao lookups under its own
policy. Never export, copy, or hardcode runtime credentials.

## Error Handling

If any phase fails, report the failure and stop dependent phases. Independent repos continue in parallel.

## Related Skills

- **sync-inventory** (infra-orchestration) — Export Terraform inventory and distribute to Ansible repositories
- **test-e2e** (infra-orchestration) — End-to-end infrastructure pipeline validation across Terraform and Ansible repos
- **infrastructure-standards** (infra-standards) — Use when working on infrastructure repos (terraform, ansible, kubernetes, proxmox, nix devShells)
