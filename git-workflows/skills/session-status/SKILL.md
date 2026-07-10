---
name: session-status
description: "Analyzes the current session state and repository status. Resolves the active plan file, reads plan checklist items and TaskList tasks, gathers unfinished work/session issues from conversation history, and checks git status — without performing any repository cleanup or session wrap-up."
---

# Session and Repository Status Analysis

This skill provides a read-only snapshot of the current session's progress, remaining work, encountered issues, and repository state. It does not perform any repository cleanup (like deleting branches or worktrees) or wrap up the session.

> **State warning**: Branch state, remote tracking, TaskList contents, and plan
> checklist state all change between invocations. Re-run every git/gh command
> and re-call `TaskList` from Step 1; never trust prior outputs from this
> conversation.

---

## Step 1: Determine Plan and TaskList State

Determine the status of the current session's plan, checkboxes, and task harness.

### 1a. Resolve which plan file belongs to this session

When a session enters plan mode, the harness injects a `<system-reminder>` into the conversation containing a literal `## Plan File Info:` block that names the plan file's absolute path (shape: `<HOME>/.claude/plans/<slug>.md`). 

To resolve:
1. Scan the current conversation context for `<system-reminder>` blocks whose body contains a path matching the regex `[^[:space:]]+/\.claude/plans/[^[:space:]]+\.md`.
2. If multiple matches exist, take the **most recently quoted** one — latest in conversation order.
3. If zero matches exist, this session never entered plan mode. Treat the plan checklist as empty.

### 1b. Read the resolved plan file

If 1a returned a path, read that file. Extract:
- GitHub-style checkboxes (`- [ ]` / `- [x]`) with their line numbers.
- Numbered or bulleted step lists under headings such as "Step", "Phase", "Tasks", or "Files to Change", but only when an item has an unambiguous done/not-done signal in the file itself or in this session's conversation.

### 1c. Read the harness TaskList

Call `TaskList` and inspect `status` per task.

### 1d. Conversation evidence for ambiguous items

For checklist items without an explicit `[x]`, decide based on this session's actual evidence: file edits, command output, and test results visible in this conversation. Be conservative: if in doubt, treat as incomplete. Never consult other sessions' transcripts.

### Completion rule

The plan is complete iff:
- every `TaskList` task has `status == "completed"` (or the list is empty), AND
- every plan-file checklist item is checked or has clear conversation evidence of completion (or there is no plan file at all).

---

## Step 2: Gather Unfinished Work and Session Issues

Scan the conversation history in **reverse chronological order**, stopping when no new items appear for ~10 consecutive messages.

### 2a. Gather Unfinished Work
- **Incomplete tasks** — anything started but not finished, or marked as TODO/FIXME during this session.
- **Items needing production-readiness** — code that works but needs hardening, tests, error handling, or documentation before it is production-ready.
- **Future work identified** — any issues, improvements, or ideas called out during the session as "later", "follow-up", "out of scope", or similar.

### 2b. Gather Session Issues
- Errors (build failures, test failures, runtime errors).
- Warnings (linter warnings, deprecation notices, compiler warnings).
- Flaky or unreliable behavior observed.
- Workarounds applied that should be properly fixed.
- Tool or dependency issues encountered.

---

## Step 3: Analyze Repository & Git Status

Perform git and GitHub checks to locate active changes and remote state:
1. Run `git status` to identify modified/untracked files and the current branch name.
2. Determine if the current branch has unpushed commits or is out of sync with its remote tracking branch.
3. Identify open PRs or issues associated with the current branch or project using `gh pr list --state open --json number,title,url,headRefName`. Match by branch name `headRefName` to find the PR for the current branch.
4. Capture full URLs for any PR or issue referenced (e.g., `https://github.com/<owner>/<repo>/pull/<n>`), never bare numbers.

---

## Step 4: Triage and Recommendations

Split the gathered items into two buckets:
1. **Next-session prompt** — items small enough to complete in a single focused session (roughly 1–3 tasks). Combine related items where possible.
2. **GitHub issues** — everything else. Before recommending new issues, search existing open issues with `gh issue list --state open --json number,title,url` for duplicates. Use full URLs for references.

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
<A ready-to-paste prompt covering the 1–3 quick-win tasks identified above. Be specific: reference file paths, function names, error messages, etc. Include the plan file path so a new session can re-enter plan mode against it: ~/.claude/plans/<slug>.md>
─────────────────────────────────────

Recommended GitHub Issues:
─────────────────────────────────────
1. <Title> — <one-line summary> [new | update <issue-url>]
─────────────────────────────────────
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Related Skills
- **wrap-up** (system) — Wraps up the session, performs repository cleanup, and handles PR purging.
- **refresh-repo** (github-workflows) — Checks PR merge-readiness, syncs local main, and cleans worktrees.
- **retrospecting** (system) — Generates detailed retrospectives based on session logs and git diffs.
