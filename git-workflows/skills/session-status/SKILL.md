---
name: session-status
description: "Analyzes current session state and repository status without any cleanup. Full mode (default): resolves the active plan file, reads plan checklist + TaskList, gathers unfinished work/issues from conversation history, checks git status, and emits a /handoff-built next-session prompt. Mid-session mode (`/session-status mid`): a fast plain-language 'done vs remaining' snapshot for mid-flight orientation, skipping the history scan, triage, and handoff."
---

# Session and Repository Status Analysis

This skill provides a read-only snapshot of the current session's progress,
remaining work, encountered issues, and repository state. It does not
perform any repository cleanup (like deleting branches or worktrees)
or wrap up the session.

> **State warning**: Branch state, remote tracking, TaskList contents, and plan
> checklist state all change between invocations. Re-run every git/gh command
> and re-call `TaskList` from Step 1; never trust prior outputs from this
> conversation.

## Two modes

| Invocation | Mode | Use |
| --- | --- | --- |
| `/session-status` (default) | **Full** — Steps 1–5, the dashboard + next-session prompt | end of session, wrap-up, deciding what to hand off |
| `/session-status mid` | **Mid-session** — the quick check below | mid-flight "where am I: what's done, what's left" |

Both modes re-derive live state; neither performs cleanup. Mid-session mode is a
fast orientation snapshot — it skips the conversation-history scan (Step 2), the
triage (Step 4), and the next-session prompt (Step 5). Reach for it when you just
want to see progress, not plan a handoff.

## Mid-session mode

Do only this, then stop:

1. Resolve the plan file (Step 1a) and read its open checklist items with line
   numbers. Call `TaskList`.
2. `git status -sb` in the cwd; note branch and ahead/behind.
3. Count done vs remaining across both the plan checklist and `TaskList`.
4. Print the compact snapshot — **plain language, no dashboard**:

```text
Mid-session: <n> done / <m> left
  Just finished:  <most recent completed item, in human terms>
  Now / next:     <the in_progress item, or the next open one>
  Still open:     <short list of remaining items, plan line #s or task IDs>
  Branch:         <name> (<ahead/behind/clean>)
```

State remaining work in the user's terms ("the org-admin token still needs
scoping"), not internal labels ("task #7 pending"). If the plan is complete, say
so in one line and suggest `/wrap-up`. Do not emit a next-session prompt in this
mode — that is what full mode and `/handoff` are for.

---

## Full mode

## Step 1: Determine Plan and TaskList State

Determine the status of the current session's plan, checkboxes, and task
harness.

### 1a. Resolve which plan file belongs to this session

When a session enters plan mode, the harness injects a `<system-reminder>` into
the conversation containing a literal `## Plan File Info:` block that names the
plan file's absolute path (shape: `<HOME>/.claude/plans/<slug>.md`).

To resolve:

1. Scan the current conversation context for `<system-reminder>` blocks whose
   body contains a path matching the regex
   `[^[:space:]]+/\.claude/plans/[^[:space:]]+\.md`.
2. If multiple matches exist, take the **most recently quoted** one — latest
   in conversation order.
3. If zero matches exist, this session never entered plan mode. Treat the
   plan checklist as empty.

### 1b. Read the resolved plan file

If 1a returned a path, read that file. Extract:

- GitHub-style checkboxes (`- [ ]` / `- [x]`) with their line numbers.
- Numbered or bulleted step lists under headings such as "Step", "Phase",
  "Tasks", or "Files to Change", but only when an item has an unambiguous
  done/not-done signal in the file itself or in this session's conversation.

### 1c. Read the harness TaskList

Call `TaskList` and inspect `status` per task.

### 1d. Conversation evidence for ambiguous items

For checklist items without an explicit `[x]`, decide based on this session's
actual evidence: file edits, command output, and test results visible in this
conversation. Be conservative: if in doubt, treat as incomplete. Never consult
other sessions' transcripts.

### Completion rule

The plan is complete iff:

- every `TaskList` task has `status == "completed"` (or the list is empty), AND
- every plan-file checklist item is checked or has clear conversation evidence
  of completion (or there is no plan file at all).

---

## Step 2: Gather Unfinished Work and Session Issues

Scan the conversation history in **reverse chronological order**, stopping when
no new items appear for ~10 consecutive messages.

### 2a. Gather Unfinished Work

- **Incomplete tasks** — anything started but not finished, or marked as
  TODO/FIXME during this session.
- **Items needing production-readiness** — code that works but needs hardening,
  tests, error handling, or documentation before it is production-ready.
- **Future work identified** — any issues, improvements, or ideas called out
  during the session as "later", "follow-up", "out of scope", or similar.

### 2b. Gather Session Issues

- Errors (build failures, test failures, runtime errors).
- Warnings (linter warnings, deprecation notices, compiler warnings).
- Flaky or unreliable behavior observed.
- Workarounds applied that should be properly fixed.
- Tool or dependency issues encountered.

---

## Step 3: Analyze Repository & Git Status

Perform git and GitHub checks to locate active changes and remote state:

1. Run `git status` to identify modified/untracked files and the current branch
   name.
2. Determine if the current branch has unpushed commits or is out of sync with
   its remote tracking branch.
3. Identify open PRs or issues associated with the current branch or project
   using `gh pr list --state open --json number,title,url,headRefName`. Match by
   branch name `headRefName` to find the PR for the current branch.
4. Capture full URLs for any PR or issue referenced (e.g.,
   `https://github.com/<owner>/<repo>/pull/<n>`), never bare numbers.
   Always emit the full URL on first reference. Bare #123 or PR 123
   references are forbidden. If the same number appears again in the
   same block, a bare #123 is acceptable as a short reference after the
   URL has been shown once.

---

## Step 4: Triage and Recommendations

Split the gathered items into two buckets:

1. **Next-session prompt** — items small enough to complete in a single focused
   session (roughly 1–3 tasks). Combine related items where possible.
2. **GitHub issues** — everything else. Before recommending new issues, search
   existing open issues with `gh issue list --state open --json number,title,url`
   for duplicates. Use full URLs for references.

---

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

Git & Repository Status:
  Current Branch:   <branch-name>
  Sync Status:      <ahead/behind/up-to-date with remote>
  Modified Files:   <list of modified/untracked files, or "clean">
  Associated PR:    <PR URL or "none found">

Unfinished Work & Future Tasks:
  - <item 1>
  - <item 2>

Session Issues Log:
  - <error/warning/workaround encountered>

Recommended Prompt for Next Session:
─────────────────────────────────────
<Build this by invoking the `/handoff` skill with the triaged 1–3 quick-win tasks
as source. `/handoff` returns a `## Goal statement` (capped under 4000 chars,
measured with `wc -c`) plus a `## Full prompt` — paste both here. This guarantees
the next-session prompt carries a real goal that drops into `/goal`, not a bare
task list. Include the resolved plan file path (~/.claude/plans/<slug>.md) so the
new session can re-enter plan mode against it.>
─────────────────────────────────────

Recommended GitHub Issues:
─────────────────────────────────────
1. <Title> — <one-line summary> [new | update <issue-url>]
─────────────────────────────────────
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Related Skills

- **handoff** (git-workflows) — builds the goal-bearing next-session prompt that
  full mode's "Recommended Prompt for Next Session" section emits.
- **wrap-up** (system) — Wraps up the session, performs repository cleanup, and
  handles PR purging.
- **refresh-repo** (github-workflows) — Checks PR merge-readiness, syncs local
  main, and cleans worktrees.
- **retrospecting** (system) — Generates detailed retrospectives based on
  session logs and git diffs.
