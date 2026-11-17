---
name: orchestrate-infra
description: Runs /agentops:orchestrate for cross-repo infrastructure work and adds the OpenTofu-before-Ansible dependency order
---

# Infrastructure Orchestrator

Run `/agentops:orchestrate` for dispatch, launch, observation and result checks.
This skill adds the dependency order between the OpenTofu and Ansible repositories.

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

Run `tofu plan` in the `tofu-proxmox` Terrakube workspace, targeted with `-target` to the modules the change touches, then
`ansible-playbook --check --limit <hosts>` on the roles the change touches, in dependency order.

### validate-all

Run `tofu validate` in tofu-proxmox, then `ansible-playbook --syntax-check`
across all Ansible repos.

### sync-inventory

Export Terraform outputs as Ansible inventory and distribute to all Ansible repos. See `/sync-inventory` for details.

### e2e-test

Full pipeline validation: validate, plan, export inventory, syntax-check, check, diff. See `/test-e2e` for details.

## Order

1. Locate each target repo locally.
2. Run the OpenTofu phase first. Ansible phases wait until it completes.
3. Run independent Ansible repos in parallel, in graph order.
4. If a phase fails, stop its dependents. Independent repos continue.
5. Report the status of each repo.

## Secret Injection

Terrakube obtains short-lived OpenBao credentials through its native dynamic
provider credential flow. Ansible uses native OpenBao lookups under its own
policy. Never export, copy, or hardcode runtime credentials.

## Related Skills

- **sync-inventory** (infra-orchestration) — Export Terraform inventory and distribute to Ansible repositories
- **test-e2e** (infra-orchestration) — End-to-end infrastructure pipeline validation across Terraform and Ansible repos
- **infrastructure-standards** (infra-standards) — Use when working on infrastructure repos (terraform, ansible, kubernetes, proxmox, nix devShells)
