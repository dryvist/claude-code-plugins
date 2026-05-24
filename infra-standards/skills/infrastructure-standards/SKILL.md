---
name: infrastructure-standards
description: Use when editing Proxmox/Terraform/Ansible inventory — VMID/IP assignment ranges and the Terraform-to-Ansible inventory contract.
---

# Infrastructure Standards

For general IaC principles, the deployment pipeline diagram, dev-shell templates,
and the SOPS-vs-Doppler decision tree, see
[docs.jacobpevans.com/infrastructure](https://docs.jacobpevans.com/infrastructure)
and the `config-secrets` / `secrets-policy` org rules. This skill carries the
operational tables an agent needs at edit time without leaving the editor.

## VMID & IP Addressing

IPs use pattern `192.168.0.{vmid}` (for VMIDs under 256).

| VMID Range | Purpose | Examples |
| --- | --- | --- |
| 100-109 | Infrastructure | ansible, pi-hole |
| 110-149 | Utilities | pve-scripts |
| 150-169 | AI Dev | claude-code, gemini |
| 170-179 | Cribl Stream | cribl-stream (171-172) |
| 180-189 | Cribl Edge | cribl-edge (181-182) |
| 190-199 | LB/Management | haproxy, splunk-mgmt |
| 200-299 | VMs | splunk-vm (200) |
| 9000-9999 | Templates | Not running, no IP |

## Terraform Inventory Contract

Terraform outputs feed Ansible dynamic inventory:

```json
{
  "splunk": {
    "hosts": ["192.168.0.200"],
    "vars": { "ansible_port": 22, "ansible_user": "ansible" }
  }
}
```

**Contract rules**:

- Terraform owns IP assignment (derived from VMID) and port assignment
- Ansible consumes but never overrides these values
- Changes to IPs/ports must originate in terraform-proxmox

## Related Skills

- **orchestrate-infra** (infra-orchestration) — Master orchestrator for cross-repo infrastructure with dependency graph dispatch
- **sync-inventory** (infra-orchestration) — Export Terraform inventory and distribute to Ansible repositories
- **test-e2e** (infra-orchestration) — End-to-end infrastructure pipeline validation across Terraform and Ansible repos
