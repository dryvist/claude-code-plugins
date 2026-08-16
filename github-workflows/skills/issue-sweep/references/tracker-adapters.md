# Tracker Adapters

How `/issue-sweep` talks to any tracker. Load during Phase 0, and whenever a
second tracker enters scope.

## Normalize before classifying

Reduce every tracker's item to one shape so no later phase branches on tracker
type:

```text
id | tracker | title | opened | last-activity | state | claim | links | human-notes
```

- `claim` — the falsifiable assertion, restated by the sweep (not the title).
- `links` — related items, and any change/PR that references this item.
- `human-notes` — explicit human direction found in the body or comments. This
  is what makes "a human statement outranks the sweep" enforceable.
- `last-activity` — the pin used in the approval order. Any change to it
  between triage and action voids that order.

## Probe capability first

Six operations. Probe them **before** promising any verdict, and degrade
gracefully when one is missing — a verdict the tracker cannot express is a
verdict the sweep must not assign.

| Operation | Needed for | If unavailable |
| --- | --- | --- |
| list open items | Phase 0 | tracker out of scope; say so |
| read item + comments | Phases 0–1 | as above |
| detect write access | before any write | sweep runs read-only; report verdicts only |
| comment | COMMENT, CLOSE | no CLOSE without an evidence comment — downgrade to report-only |
| close (with reason) | CLOSE | close without reason, and put the reason in the comment |
| relate items | LINK | record the counterpart's URL in a comment instead |

Read and write frequently use **different credentials or roles**: a token that
lists items may not be able to close them. Discover that during the probe, not
at the first write. Fetch credentials per the project's secrets convention,
hold them in memory for the session, and never write them to disk.

Some APIs return the same error for "not permitted" and "route does not exist
in this version". Confirm a known-good route before concluding a credential
lacks permission.

## GitHub issues

Command shapes come from **gh-cli-patterns** — do not invent query forms.
Issue-specific notes:

- Issue and PR search share a syntax; filter by type explicitly or PRs
  contaminate the inventory.
- Close reasons distinguish completed from not-planned. Map `fixed` to
  completed; map `obsolete` and `wontfix` to not-planned rather than implying
  work happened.
- A mention creates a cross-reference; marking a true duplicate is a distinct
  action. A mention is not a duplicate relation.
- Cross-referenced open PRs are the in-flight signal from the verification
  guards — check them before any CLOSE.
- Installation tokens carry no user identity, so comments post as an app.
  Write evidence accordingly.
- On a public tracker, every comment is published permanently: keep evidence
  to what was checked and what it returned.

## API-based trackers

For a tracker reached over HTTP (project-management tools, internal systems):

- Creation, update, and relation routes vary in method and shape; verify each
  against the tracker's own documentation rather than assuming REST defaults.
- "Done" may be a boolean, a state id, or a status field. Learn which before
  treating an item as closed — and note that a done flag plus a far-future or
  absent due date can mean "never expires", not "still active".
- Where no native relation type exists, put the counterpart URL in both items.
  Two plain URLs navigate both directions.
- Rate limits and pagination differ; page explicitly rather than assuming one
  request returned everything. A short first page that looks like the whole
  backlog is how a sweep silently under-reports.

## Multiple trackers in one run

- Treat each tracker as its own serialization domain: parallelize verification
  across them, serialize writes within each.
- The same problem often appears in two trackers (a public bug report and an
  internal task). That is a LINK across trackers, and only one of them should
  carry the plan — say which.
- Report per-tracker counts separately. A combined "open before → after"
  hides a tracker that was read-only or skipped.
