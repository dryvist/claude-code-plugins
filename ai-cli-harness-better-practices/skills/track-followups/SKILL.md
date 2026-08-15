---
name: track-followups
description: Record triaged follow-up work where it will actually be seen — create the item in the issue tracker (Vikunja) or the incident system of record (Zammad), deduplicating first and reporting the created identifier. Use when a session produced work that outlives it, or when another skill has triaged items and needs them tracked rather than merely listed. Never opens a GitHub issue.
license: Apache-2.0
metadata:
  version: 1.0.0
  author: dryvist homelab
  hermes:
    category: workflow
    tags:
      - tracking
      - followups
      - triage
    related_skills:
      - wrap-up
      - session-status
---

# Track Follow-Ups

Given follow-up items that have already been triaged, put each one where it will
be seen again. **A listed follow-up is not a tracked follow-up.** This skill
creates the item and reports back what it created.

It owns the routing and the creation mechanics. Callers own the triage.

## Routing

| Kind of item | Destination | Why |
| --- | --- | --- |
| Work to be done — defects, features, chores, tech debt, side quests | **Your issue tracker** (Vikunja) | It is a task; it belongs on the board with everything else |
| Incidents — outages, anomalies, RCA-worthy events, security findings, weaknesses | **The incident system of record** (Zammad) | Incidents need a lifecycle, an audit trail, and a place that is not public |
| Small enough to finish next session (roughly 1–3 tasks) | The next-session prompt | Tracking it would be overhead; it is about to be done |

### GitHub issues are never created

Public GitHub carries **pull requests only**. Never open a GitHub issue, and never
put an incident narrative, security finding, credential detail, internal hostname,
topology, or outage timeline in any GitHub issue, PR body, comment, or commit
message. "It is only a side quest" is not an exemption — that reasoning is exactly
how operational detail reaches a public repository.

An item that is both an incident and a code fix gets **split**: an incident ticket
and a tracker task, each carrying the other's URL in its description. Cross-linking
is a plain URL each way; there is no integration to configure.

## Procedure

### 1. Confirm the tooling is there

Check for `mcp__vikunja__*` and `mcp__zammad__*` before anything else. Nothing
available for a given destination means this skill **falls back to listing** those
items and says so in one line — it does not silently drop them, and it does not
guess an identifier, project, or ticket number.

### 2. Deduplicate before creating

Search the destination for an existing open item covering the same thing.

```text
tracker:   mcp__vikunja__vikunja_tasks  { subcommand: "list", allProjects: true,
                                          search: "<distinctive phrase>", filter: "done = false" }
incidents: mcp__zammad__zammad_search_tickets
```

A match means **update it** — add a comment carrying the new evidence — rather than
creating a near-duplicate. When the search could not run, still create the item but
mark it `[dedup not checked — tracker unavailable this session]`. Never present an
unchecked list as deduplicated.

### 3. Resolve the destination project

Discover it, do not hard-code it: `mcp__vikunja__vikunja_projects { subcommand:
"list", search: "<project name>" }`. Project identifiers differ per install and per
person, and a hard-coded one silently files work into someone else's board.

Ask the user which project when the search is ambiguous and no default is
configured for the session.

### 4. Create the item

```text
mcp__vikunja__vikunja_tasks {
  subcommand: "create",
  projectId:  <resolved>,
  title:      "<imperative, specific — the change, not the symptom>",
  description: "<what, why it matters, what was already tried, and the URL of the
                PR / ticket / plan file it came from>"
}
```

Title rules: imperative and specific enough to act on cold — "Fix stale
`agent-validated` status after a force-push", not "CI thing". Description carries
the context the next reader will not have, and the origin URL so the trail is
navigable both ways.

For incidents, use `mcp__zammad__zammad_create_ticket` with the same discipline,
plus the tags that install already uses.

### 5. Report what was created

Return one line per item: kind, title, and the **created identifier or URL**. A
report that says "tracked" without an identifier is not evidence that anything was
created — the caller cannot verify it and neither can the user.

State explicitly, in one line, anything that was listed instead of created and why.

## Related Skills

- **wrap-up** (this plugin) — calls this skill at Path A step A2.5 so follow-ups
  are recorded before the handoff artifact is built.
- **session-status** (this plugin) — produces the triage this skill consumes.
- **handoff** (this plugin) — carries the session-sized bucket that is deliberately
  *not* tracked here.
