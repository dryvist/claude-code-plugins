---
name: handoff
description: "Emit a paste-ready two-part handoff for a fresh session: a `## Goal statement` hard-capped under 4000 characters (produced by the /goal skill), plus an unbounded `## Full prompt` carrying cwd, ordered reading list, hard rules, pitfalls, and deliverables. Runs with or without a git repository — branch and PR facts are optional enrichment. Use when forking work to a new session, spinning up an orchestrator, or when wrap-up needs a next-session prompt with a real goal and not just a task list."
---

# Handoff

Produce one artifact a fresh session can run cold: a short **goal statement** and
a long **full prompt**. The new session sees none of the current conversation, so
the artifact must stand alone.

The goal statement is capped because a harness goal field consumes it; `/goal`
owns that cap. The full prompt is the first message of the new session and has
no cap.

> **State warning**: TaskList contents, plan checklist state, and any git state
> all drift. Re-gather them when you build the handoff. Never copy state from
> earlier in this conversation.

## When to use

- Forking unfinished work to a fresh session (the common case).
- Standing up an orchestrator or subagent that starts with no context.
- Inside `/wrap-up`: Path A's follow-up prompt and Path B's resume blocks both
  call this skill instead of emitting a prompt with no goal.

## Step 1: Gather live state

Do not trust memory. Collect what exists; skip what does not.

**Always available:**

- The plan file path (from the plan-mode `## Plan File Info:` reminder) and its
  open checklist items with line numbers.
- `TaskList` — tasks whose `status != "completed"`.
- The one or two files a fresh session must read first to be dangerous.

**Version-control enrichment — only when the cwd is a repository.** Guard it:

```bash
git rev-parse --is-inside-work-tree >/dev/null 2>&1
```

When that succeeds, add: `git status`, current branch, and any worktree paths
the work lives in; open PRs/issues via `gh pr list` / `gh issue list`. Capture
**full URLs**, never bare `#123`.

When it fails, skip the whole block and say so in the emitted artifact ("no
repository at this cwd; branch and PR state omitted"). A handoff without git
facts is still a handoff — the reading list, rules, and pitfalls carry it.

**Ticket enrichment — only when the tools are configured.** If `mcp__zammad__*`
is available this session, check with `zammad_search_tickets`; otherwise rely on
ticket numbers already known from context. Capture **full ticket URLs**
(`$ZAMMAD_URL/#ticket/zoom/<id>`), never a bare `#17053` — same rule as GitHub,
extended to Zammad.

## Step 2: Get the goal statement

Invoke the `/goal` skill. Its argument is a **focus hint**, not a state dump —
pass one or two sentences naming the objective and its boundary, distilled from
Step 1. For example: "finish the token-minting cutover in PR 437; deploy and
document, not redesign." Do not paste the raw Step 1 findings; `/goal` treats the
argument as a steer whose exclusions bind literally, so a dump of PR URLs and
file paths produces criteria about the wrong things.

`/goal` returns a `## Goal statement` already measured against the
4000-character cap. Use its block verbatim under this skill's own header from
Step 4 — do not rewrite it, re-cap it, or append criteria. One definition of a
goal statement lives in `/goal`, and this skill consumes it.

## Step 3: Write the full prompt (no cap)

The full prompt is everything the goal statement leaves out. Fixed skeleton:

```text
cwd: <absolute path the new session starts in>

<the goal statement, verbatim>

READ FIRST (in this order, before any change):
1. <file/doc + one line on why it matters>
2. ...

HARD RULES:
- <branching model, converge syntax, lane discipline, secret handling — every
  constraint that, if broken, wastes the session or causes harm>

PITFALL LIST (treat as constraints):
- <the specific traps this work has, e.g. "empty-state create-everything plan is a
  red flag", "poll for readiness before declaring a boot failure">

DELIVERABLES:
- <merged PRs, verified services, docs, and a final report shape>
```

Rules:

- **Ordered reading list.** Number the files. A fresh session reads top-down, so
  order by "what unblocks understanding first."
- **Rules must be actionable.** "Be careful with secrets" is noise. "Use existing
  values when re-seeding; no secret values in any transcript or PR" is a rule.
- **Restate the goal; never say "continue."** The new session has no memory. Never
  write "continue what you were doing" or "as discussed above."
- Full URLs for every PR/issue/Zammad ticket. Absolute paths for every file and cwd.
- **Say what was not gathered.** If the git or ticket block was skipped, note it
  under HARD RULES so the new session re-derives it rather than assuming clean.

## Step 4: Emit

Print both parts under clear headers so the user can copy each independently:

```text
# Handoff: <objective> (fresh <model> session)

## Goal statement (paste as the session goal — <N> chars, under 4k)
<goal statement>

## Full prompt (paste as the first message of the new session)
<full prompt block>
```

Report the measured goal character count on the header line. If the goal could not
be brought under 4000 without dropping a needed criterion, say so explicitly and
show the count — do not silently ship an over-cap goal.

## Related Skills

- **goal** (this plugin) — owns the goal statement and its cap; Step 2 calls it.
- **wrap-up** (this plugin) — calls this skill for its follow-up prompt (Path A)
  and resume blocks (Path B).
- **session-status** (this plugin) — supplies the live state gathered in Step 1.
- **git-flow-next** (git-workflows) — branching model facts for the HARD RULES
  section, when the work is in a repository.
