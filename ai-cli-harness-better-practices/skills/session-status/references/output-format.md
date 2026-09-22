# Output format and small-model extraction prompt

Reference detail for `session-status` full mode. Loaded on demand.

## Validation follow-up check

Step 3.5's item 5: for every open PR this session authored (branch name or
PR body carries this session's id, plus any PR created in this
conversation), check the `agent-validated` commit status on the current
head SHA:

```bash
head_sha=$(gh pr view <n> --json headRefOid --jq '.headRefOid')
gh api "repos/{owner}/{repo}/commits/$head_sha/statuses" \
  --jq '[.[] | select(.context == "agent-validated")][0].state'
```

Flag as **needs follow-up**: no `agent-validated` status on the head SHA
(unvalidated, or validated evidence went stale when new commits landed),
state `failure`, or the PR is validated but sitting unmerged. These are
enforced follow-ups — they go in the report and, when unfinished, into
the next-session prompt or a tracker item (Step 4).

## Small-model extraction prompt (Step 3.5)

Short imperatives, explicit schema, hard STOP — used by "Delegate the bulk
read":

```text
Extract items from the input. Do not explain. Do not advise. Do not fix.
Output ONLY this table, one row per item:
  item | kind (TASK/ISSUE/PR/CHECKLIST) | state | evidence (line no, URL, or quote)
Rules:
1. Copy text verbatim. Never paraphrase an item.
2. Unknown field -> write UNKNOWN. Never guess a state.
3. At most 60 rows. STOP after the table.
```

## Step 5 dashboard template

## Step 5: Output Format

Present the final status analysis in the following structured dashboard:

```text
Session & Repository Status Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Active Plan:
  Plan File:        <plan-file path or "none">
  Status:           <complete | incomplete | "no plan file found">
  Progress:         <n> of <m> checklist items completed
  Open Items:       <list open checklist items with line numbers, or "none">

Harness TaskList:
  Status:           <complete | incomplete | "empty">
  Open Tasks:       <list open tasks, or "none">

Git & Repository Status:      <or "not a repository — skipped">
  Current Branch:   <branch-name>
  Sync Status:      <ahead/behind/up-to-date with remote>
  Modified Files:   <list of modified/untracked files, or "clean">
  Associated PR:    <PR URL or "none found">
  Validation:       <per session PR: agent-validated success | FAILURE | MISSING on head SHA; or "no session PRs">

Unfinished Work & Future Tasks:
  - <item 1>
  - <item 2>

Session Issues Log:
  - <error/warning/workaround encountered>

Recommended Prompt for Next Session:
─────────────────────────────────────
<Build this by invoking the `/handoff` skill with the triaged 1–3 quick-win tasks
as source. `/handoff` returns a `## Goal statement` (capped under 4000 chars,
measured with `wc -m`) plus a `## Full prompt` — paste both here. This guarantees
the next-session prompt carries a real goal that drops into `/goal`, not a bare
task list. Include the resolved plan file path (~/.claude/plans/<slug>.md) so the
new session can re-enter plan mode against it.>
─────────────────────────────────────

Recommended Tracker Items:
─────────────────────────────────────
1. <Title> — <one-line summary> [new | update <item URL>]
─────────────────────────────────────

Recommended Incident Tickets:
─────────────────────────────────────
1. <Title> — <one-line summary> [new | update <ticket URL>]
─────────────────────────────────────
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Both lists are **recommendations**; `track-followups` creates them and reports the
resulting identifiers.

If every item in the "Unfinished Work & Future Tasks" section above is already
tracked, write the heading as
`Unfinished Work & Future Tasks (already tracked):` and prefix
each item with its bare identifier, matching this shape:

```text
Unfinished Work & Future Tasks (already tracked):
  - #17053  <one-line description>
  - #17058  <one-line description>
```

This is a live, human-facing report, not a cold-start artifact — a bare
`#NNNNN` here is fine. The "always full URL, never bare `#123`" rule applies
to `handoff` and `wrap-up`'s resume blocks, not this dashboard.
