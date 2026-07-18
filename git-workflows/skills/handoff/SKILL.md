---
name: handoff
description: "Emit a paste-ready two-part handoff for a fresh session: a `## Goal statement` hard-capped under 4000 characters (measured with wc -c, never estimated) that pastes straight into Claude Code's /goal Stop hook, plus an unbounded `## Full prompt` carrying cwd, ordered reading list, hard rules, pitfalls, and deliverables. Use when forking work to a new session, spinning up an orchestrator, or when wrap-up needs a next-session prompt with a real goal and not just a task list."
---

# Handoff

Produce one artifact a fresh session can run cold: a short **goal statement** and
a long **full prompt**. The new session sees none of the current conversation, so
the artifact must stand alone.

The goal statement feeds Claude Code's built-in `/goal` Stop hook, which is why it
is capped. The full prompt is the first message of the new session and has no cap.

Canonical shape to match: `~/.claude/plans/handoff-vikunja-nautobot-zammad.md`.

> **State warning**: git state, TaskList contents, and plan checklist state all
> drift. Re-run every git/gh command and re-read the plan file when you build the
> handoff. Never copy state from earlier in this conversation.

## When to use

- Forking unfinished work to a fresh session (the common case).
- Standing up an orchestrator or subagent that starts with no context.
- Inside `/wrap-up`: Path A's follow-up prompt and Path B's resume blocks both
  call this skill instead of emitting a prompt with no goal.

## Step 1: Gather live state

Do not trust memory. Collect, at minimum:

- The plan file path (from the plan-mode `## Plan File Info:` reminder) and its
  open checklist items with line numbers.
- `TaskList` — tasks whose `status != "completed"`.
- `git status`, current branch, and any worktree paths the work lives in.
- Open PRs/issues for the work: `gh pr list` / `gh issue list`. Capture **full
  URLs**, never bare `#123`.
- Open Zammad tickets for the work, if any: if `mcp__zammad__*` tools are
  available this session, check with `zammad_search_tickets`; otherwise rely on
  ticket numbers already known from context. Capture **full ticket URLs**
  (`$ZAMMAD_URL/#ticket/zoom/<id>`), never a bare `#17053` — same rule as
  GitHub, extended to Zammad.
- The one or two files a fresh session must read first to be dangerous.

## Step 2: Write the goal statement (HARD CAP < 4000 chars)

The goal statement states the objective and the end state. It is not a task dump.

Rules:

- **Lead with scope and a boundary.** One or two sentences naming the objective,
  then an explicit "your job is X, not Y" so the new session cannot wander.
  Example: *"deploy + wire + document, not rewrite."*
- **Then numbered success criteria, in dependency order.** Each item leads with a
  **bolded** noun phrase. The last item is always "verify end to end."
- **Conditions and end state, not steps.** Say what "done" looks like, not how to
  get there — the full prompt carries the how.
- **No secret values, hostnames, or IPs** if the artifact might land in a public
  place. Reference where a value lives, never the value.

**Measure it. Never estimate.** Write the goal to a temp file and run:

```bash
wc -c < /path/to/goal.txt   # must print < 4000
```

If it is 4000 or more, cut scope words and success-criteria prose until it fits —
do not shrink by deleting a whole criterion the work needs. Re-measure after every
cut. State the final count to the user.

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

- **wrap-up** (git-workflows) — calls this skill for its follow-up prompt (Path A)
  and resume blocks (Path B).
- **session-status** (git-workflows) — supplies the live state gathered in Step 1.
- **git-flow-next** (git-workflows) — branching model facts for the HARD RULES section.
