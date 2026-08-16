---
name: proxmox-cluster-ops
description: Operate a Proxmox VE cluster safely — read-only inspection with pvesh/pct/qm/pvecm instead of hand-editing a live guest, node-by-node package updates that respect quorum, and the shape of joining a new node to an existing cluster. Use when inspecting cluster or guest state, planning a rolling update across cluster nodes, or adding a node to a Proxmox cluster.
---

# Proxmox VE cluster operations

Three recurring operator tasks on a Proxmox VE cluster, generalized from
real bring-up and maintenance work. Every identifier is a placeholder —
substitute your own node names, VMIDs, and domain.

## Read-only inspection — never converge a guest by hand

Inspecting cluster or guest state (is a service active, what does a log say,
is a container running) is safe to do directly. **Changing** anything on a
live guest by hand is not — config changes belong in configuration
management (Ansible or equivalent), and shape changes (new guest, resized
disk) belong in infrastructure-as-code (Terraform/OpenTofu or equivalent). A
manual fix that seems to need a hand-edit is a gap in that automation to
close, not a thing to do live.

```bash
ssh root@<node-ip> 'pvecm status'                 # cluster quorum
ssh root@<node-ip> 'qm list' 'pct list'            # VMs / containers on a node
ssh root@<node-ip> 'pvesh get /nodes/<node>/storage'  # structured API query
```

Or over HTTPS with an API token, no SSH hop at all:

```bash
curl -sk -H "Authorization: PVEAPIToken=$PVE_API_TOKEN" \
  "https://<node-ip>:8006/api2/json/nodes/<node>/storage" | jq .
```

**`pct exec` vs a direct guest SSH** — use `pct exec <vmid> -- <cmd>` from
the node when the guest is an LXC **container** and either its own SSH isn't
reachable or you only need a one-off command. Use a direct SSH to the guest
when you need an interactive shell for extended inspection, or the guest is
a **VM** (`pct exec` is container-only; use `qm guest exec` or SSH for VMs).

Node addresses that predate DNS bootstrapping (the Proxmox nodes themselves,
before anything else can resolve) are the one legitimate place to look up a
current IP from your own inventory rather than relying on a name — everything
else should be addressed by FQDN.

## Rolling updates that respect quorum

A cluster needs a strict majority of nodes online to stay quorate (e.g. 2 of
3, 3 of 5). Update **one node at a time**, and never take a second node down
while the first is still rebooting or rejoining — that's the exact window
where a second failure loses quorum and makes the cluster read-only.

1. Confirm quorum is healthy (`pvecm status`) before touching anything.
2. Live-migrate or stop any guest on that node that can't tolerate the
   coming reboot.
3. Update packages, reboot if the kernel changed, confirm the node rejoins
   quorate before moving to the next.
4. Repeat, one node at a time. If any node in the cluster has a scheduled
   sleep/power-down window, update it last, and only outside that window, so
   it has time to fully rejoin before its next scheduled power-off.

## Adding a node to the cluster

The shape that generalizes across a join, regardless of hardware:

1. **Install and configure networking first**, matching the existing
   cluster's Proxmox major version — a joining node must match.
2. **Verify hardware before trusting it for workloads** — e.g. confirm
   expected device nodes exist for any passthrough hardware (GPU, NIC) before
   scheduling anything onto the node that depends on it.
3. **Gate the join on DNS resolving**, if the estate is DNS/FQDN-first:
   `dig +short <new-node>.<domain>` must return the expected address before
   any converge step runs against that name.
4. **Join via automation, verifying the peer's fingerprint** — a join trusts
   whichever cluster it's handed; confirm the existing cluster's fingerprint
   before the new node commits, and let serial preflights (version match,
   ring reachability, no pre-existing cluster config on the new node) run
   before the actual `pvecm add`. A half-joined node is worse than an
   unjoined one.
5. **Confirm quorum arithmetic explicitly** after the join — e.g. going from
   a 3-node to a 4-node cluster changes the number of nodes needed to stay
   quorate; re-derive the new "N/total, quorate?" table rather than assuming
   the old threshold still applies.
6. **Full converge**, then mark the node commissioned in whatever tracks
   desired state (infra-as-code state file, inventory flag) — only after
   both the cluster and the configuration-management side agree the node is
   real.
7. **Verify storage** before scheduling guests: pools import and are healthy,
   and the node reports its storage to the rest of the cluster.

## Related

- **infrastructure-standards** (infra-standards) — VMID/IP ranges and the
  Terraform-to-Ansible inventory contract this pattern assumes.
- **terrakube-ops** (this plugin) — the IaC side that should own any shape
  change to a guest, rather than a hand-edit.
