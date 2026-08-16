# homelab-ops

High-level operational runbooks for homelab management: DR-node power
management, DNS ingress convergence, secrets-engine identity bring-up,
Proxmox VE cluster operations, Terrakube operations, PXE netboot installs,
LLM router operations, and workstation off-box backup.

## Skills

- **`/homelab-runbooks`** - Power-managed DR node wake (Dell PowerEdge/iDRAC),
  DNS ingress-alias record convergence, and OpenBao/Terrakube identity bring-up order
- **`/proxmox-cluster-ops`** - Read-only Proxmox VE inspection with pvesh/pct/qm/pvecm,
  quorum-respecting rolling node updates, and the shape of joining a new node to a cluster
- **`/terrakube-ops`** - Canonical Terrakube login/plan/apply workflow, why a targeted
  apply is dangerous, workspace lock recovery, the offline-mirror gotcha, and the
  token-rotation trap
- **`/pxe-netboot`** - Reliable PXE install path for hardware with an unreliable
  virtual-media/remote-KVM path: proxyDHCP + TFTP, HTTP-served kernel/initrd, and a
  custom-built iPXE binary with an embedded autoexec script
- **`/llm-router-ops`** - Operate a self-hosted OpenAI-compatible LLM router: client
  wiring, adding a backend model, the env-vs-persisted-config gotcha, and why an
  unauthenticated probe should 401
- **`/workstation-offbox-backup`** - Keep a data-heavy workstation app's local database
  small while preserving full, directly-accessible history off-box, split by data shape

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/homelab-ops
```

## Usage

```text
/homelab-runbooks
/proxmox-cluster-ops
/terrakube-ops
/pxe-netboot
/llm-router-ops
/workstation-offbox-backup
```

## License

MIT
