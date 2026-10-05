---
name: proxmox-cluster-ops
description: Operate a Proxmox VE cluster safely — monitoring-first state checks, quorum-respecting node updates, and joining a new node. Use for cluster operations, rolling updates, or adding a node.
---

# Proxmox VE cluster operations

Three recurring operator tasks on a Proxmox VE cluster, generalized from
real bring-up and maintenance work. Every identifier is a placeholder —
substitute your own node names, VMIDs, and domain.

## Current state

For cluster, guest, service, GPU, and storage state, follow the
`monitoring-first` skill. This runbook covers Proxmox-specific change
procedures. Keep live guest configuration in configuration management and
guest shape changes in infrastructure-as-code; do not edit live guests by
hand.

## Rolling updates that respect quorum

A cluster needs a strict majority of nodes online to stay quorate (e.g. 2 of
3, 3 of 5). Update **one node at a time**, and never take a second node down
while the first is still rebooting or rejoining — that's the exact window
where a second failure loses quorum and makes the cluster read-only.

1. Confirm quorum is healthy in monitoring before touching anything; cite the
   query or panel used.
2. Live-migrate or stop any guest on that node that can't tolerate the
   coming reboot.
3. Update packages, reboot if the kernel changed, and verify through
   monitoring that the node rejoins quorate before moving to the next.
4. Repeat, one node at a time. If any node in the cluster has a scheduled
   sleep/power-down window, update it last, and only outside that window, so
   it has time to fully rejoin before its next scheduled power-off.

## Adding a node to the cluster

The shape that generalizes across a join, regardless of hardware:

1. **Install and configure networking first**, matching the existing
   cluster's Proxmox major version — a joining node must match.
2. **Verify hardware before trusting it for workloads** through monitoring,
   citing the query or panel for passthrough devices such as GPUs and NICs.
3. **Gate the join on DNS resolving**, if the estate is DNS/FQDN-first:
   `dig +short <new-node>.<domain>` must return the expected address before
   any converge step runs against that name.
4. **Join via automation, verifying the peer's fingerprint** — a join trusts
   whichever cluster it's handed; confirm the existing cluster's fingerprint
   before the new node commits, and let serial preflights (version match,
   ring reachability, no pre-existing cluster config on the new node) run
   before the actual `pvecm add`. A half-joined node is worse than an
   unjoined one.
5. **Confirm quorum arithmetic explicitly** after the join using monitoring
   evidence — e.g. going from a 3-node to a 4-node cluster changes the number
   of nodes needed to stay quorate; re-derive the new "N/total, quorate?"
   table rather than assuming the old threshold still applies.
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
