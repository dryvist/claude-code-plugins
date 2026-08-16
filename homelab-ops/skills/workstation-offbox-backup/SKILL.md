---
name: workstation-offbox-backup
description: Keep a data-heavy workstation app's local database small and fast while preserving full history off-box, with archived data staying directly readable without a restore step. Splits by data shape — searchable text to a log/search platform, bulk media to snapshotted storage — and pulls data rather than scripting a push. Use when a continuously-recording local app's database or disk footprint is growing unbounded, or when designing where a new data-heavy app's history should live.
---

# Workstation data → off-box backup pattern

A workstation app that continuously records data (activity trackers,
recorders, local-first tools with a growing SQLite file) tends to grow an
ever-larger local database plus a pile of bulk media. Left alone it bloats
the machine and slows the app's own queries. The goal: keep the **local**
store small and fast, never lose history, and keep old data **directly
accessible** without a restore round-trip.

The trick is to split by *what the data is for*, and lean on infrastructure
you already run rather than writing a custom uploader.

## The split: searchable text vs. bulk bytes

| Data | Destination | Why |
| --- | --- | --- |
| Searchable text (anything you'd query) | A log/search platform you already run | Indexed and retained centrally — far more searchable than a local file, and it doubles as the backup |
| Bulk media (large binary files) | Durable, snapshotted storage | Heavy, not searchable — just needs point-in-time copies |

Once a row's text is indexed centrally and its media is on durable storage,
the local row is disposable — that's what makes aggressive local pruning
safe.

## Text → search platform (pull, don't push)

Most apps have no native log-forwarding sink. Rather than script an
exporter, **pull** with a collector you already run against the app's local
API or database on a schedule. Use a short collection window with a small
overlap, and de-duplicate on the row's monotonic id — if rows are immutable,
overlap plus dedup means no gaps and no duplicates, with no cursor state to
maintain by hand.

If the app exposes only a local database file and no API, a
filesystem/database-native collector is the equivalent pull — still
declarative collector config, not a maintained script.

## Bulk media → durable storage

Push media off-box with the app's own native sync if it has one (e.g. SFTP
to an existing host), otherwise a scheduled `rsync`. Land it on storage
that's already snapshotted and replicated — you inherit point-in-time
history and off-node durability for free instead of building your own. Run
the sync on a timer that fires on wake, so a machine that sleeps overnight
simply catches up the next time it's awake.

## Keep local small

With history safely off-box, set the app's retention window low and confirm
it prunes **database rows**, not just media files on disk — many apps
default to pruning only the media while keeping the (often much larger)
text/index rows forever, which defeats the whole point.

Turn on local pruning **last**. Both off-box paths — text to the search
platform, media to durable storage — must already be flowing before pruning
is safe, or pruning deletes rows/files that were never actually backed up.
If the local store was recently reset, there's a grace window equal to the
retention period before pruning actually removes anything.

## Direct access to old data (no restore)

This is the point of landing plain files on durable storage rather than an
opaque backup blob:

- **Searchable history** — query the search platform directly.
- **A frozen pre-reset database** — copy it to storage that's exported
  read-only, mount it read-only from the workstation, and open the file
  directly with the app's own query tool. Point-in-time copies are then just
  filesystem snapshots of that export.
- **Bulk media** — reachable on demand over the same network share.

No backup-restore cycle anywhere — everything is a normal file you can open.

## One-time seed migration

If a large historical archive already sits on the workstation, move it once
and reclaim the space. Split it the same way: the database file to the
read-only-exported location (directly queryable), the media to durable
storage (on-demand access). Verify integrity (a database integrity check,
size match on the media) before deleting the local copy. If the archived
database's id space overlaps the live one, keep it as a standalone file
rather than trying to merge them.

## Related

- **infrastructure-standards** (infra-standards) — where snapshot/retention
  policy for the destination storage is typically declared.
