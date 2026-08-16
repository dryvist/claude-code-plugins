---
name: zfs-resumable-transfers
description: Always send large ZFS datasets as resumable (zfs receive -s / zfs send -t) instead of plain zfs send | zfs receive -F. An interrupted non-resumable transfer discards everything already sent, not just the tail, turning a brief network blip into hours of wasted retransfer. Use when scripting or running any zfs send/receive moving a non-trivial dataset.
---

# ZFS resumable send/receive

## The rule

**Any `zfs send | zfs receive` moving a non-trivial dataset must be
resumable.** Receive with `-s` (saves a resume token on interruption) and
retry an interrupted transfer with `-t <token>`:

```bash
zfs receive -s pool/dataset
# on interruption, resume instead of restarting. receive_resume_token lives
# on the RECEIVING dataset; zfs send -t must run on the SENDING host — for a
# local-to-local transfer that's the same host:
zfs send -t "$(zfs get -H -o value receive_resume_token pool/dataset)" | \
  zfs receive -s pool/dataset

# for the common case where send and receive are on different hosts, fetch
# the token from the receiving host and run zfs send -t over ssh to the
# source host instead:
TOKEN=$(zfs get -H -o value receive_resume_token pool/dataset)
ssh source-host "zfs send -t '$TOKEN'" | zfs receive -s pool/dataset
```

`zfs receive -F` alone is **not** resumable. Without `-s`, any interruption —
a dropped SSH session, a reboot on either end, a network blip — discards the
entire partial transfer. The next attempt starts over from zero, not from
where it left off. This is documented, stable OpenZFS behavior (see
`man zfs-receive` for the same `-s`/`-t` contract on any host).

## Why this matters more than it looks

The failure mode is not "the transfer is slower." It's "the transfer has no
partial credit." A 90%-complete multi-terabyte transfer that gets
interrupted in the last minute is exactly as expensive to retry as one
interrupted in the first minute. On a large dataset, that turns a brief
unrelated hiccup — a reboot, a flaky link, a maintenance window — into hours
of repeated, wasted retransfer. One real migration lost 1.52 TiB of an
already-sent 3.48 TiB dataset to an unrelated host reboot, purely because
`-s` was omitted.

## Checklist for any new send/receive script

1. Receive with `-s` — always, even for transfers expected to be short. The
   interruption that matters is the one nobody planned for.
2. Hold the source snapshot for the duration of the transfer
   (`zfs hold <tag> pool/dataset@snap`) so it can't be pruned mid-resume.
3. On failure, check for a resume token before falling back to a fresh send:
   `zfs get -H -o value receive_resume_token pool/dataset`. A non-empty
   value means resume, not restart.
4. Release the hold only after the receive is confirmed complete.

## Related

- **proxmox-cluster-ops** (this plugin) — guest migration and evacuation
  scenarios where a large ZFS transfer is often the long pole.
