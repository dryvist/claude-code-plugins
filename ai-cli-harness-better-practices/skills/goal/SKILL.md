---
name: goal
description: "Emit one goal statement for the current work, hard-capped under 4000 characters and measured with wc -m, never estimated. Takes an optional focus hint like /compact ('focus on the auth path, ignore docs'); with no argument it derives the objective from the session's recent pivots plus any unfinished plan or task items. Reads only conversation, plan file, and task list — no git, no network, no file writes — so it runs in any directory at any moment. Use when asked for a goal, objective, mission, or 'what am I trying to do', when seeding a fresh session or subagent, or when /handoff needs its goal half."
---

# Goal

Emit a single objective statement the reader can act on with no other context.
Print it and stop. This skill produces one artifact and takes no other action.

Run it at any point: mid-task, before a handoff, after a pivot, in a scratch
directory with no repository. It never blocks on state it cannot find.

## Scope

**In:** one goal statement body, under 4000 characters, printed to the user.
Direct invocation wraps it in a `## Goal statement` header (Step 5); the body
itself never contains a heading.

**Out:** file writes, commits, git or `gh` calls, network access, plan edits,
task updates. The single command this skill runs is the `wc -m` measurement in
Step 4, which reads from a heredoc and writes nothing. If you find yourself
running anything else, stop — that belongs to `/handoff`, not here.

## Step 1: Determine focus

If an argument was supplied, it **is** the focus. Treat it exactly as
`/compact`'s hint: a steer on what matters, not a full specification. Honor
exclusions in it literally — "ignore the docs work" means no docs criterion,
even if docs work is unfinished.

With no argument, derive focus from these sources, highest weight first:

1. **The most recent pivot.** Where the work changed direction, scope, or
   approach — a correction, a rejected approach, a new constraint. The current
   objective lives after the last pivot, not at the top of the session.
2. **Unfinished plan items.** Resolve the plan file from the most recent
   `## Plan File Info:` block in a `<system-reminder>` — match
   `[^[:space:]]+/\.claude/plans/[^[:space:]]+\.md` and take the latest. Read it
   and collect unchecked `- [ ]` items. No such block means no plan file; skip.
3. **Open tasks.** Call `TaskList`; keep entries whose `status != "completed"`.

Skip any source that is absent. All three absent is normal and fine — derive
the goal from the conversation alone.

Where sources disagree, the conversation wins. A plan file records what was
true when written; the session records what is true now.

## Step 2: Draft the statement

Two parts, in this order.

**Objective and boundary.** One or two sentences naming what must become true,
then an explicit limit so the reader cannot wander. The boundary is what makes
this a goal instead of a wish — write "deploy and document, not redesign", not
"improve the deployment".

**Numbered success criteria, in dependency order.** Each leads with a bolded
noun phrase. Each is a **verifiable condition**: something a reader can check
and get a yes or no. "Error handling is improved" is not checkable; "**Retry
path** — a failed upload retries three times, then surfaces the error" is. See
`karpathy-skills:karpathy-guidelines` for why unverifiable criteria produce
confident wrong work.

The last criterion is always end-to-end verification. Name what gets run and
what output proves it.

Close with one persistence line calibrating how eagerly to proceed: keep working
until every criterion holds, and do not stop to ask when the next action is
unambiguous.

## Step 3: Enforce the rules

Check the draft against every rule before printing.

| Rule | Why |
| --- | --- |
| State end conditions, never steps | Steps go stale; conditions stay true |
| Self-contained — no "continue where you left off", no "as discussed above" | The reader has no memory of this session |
| Absolute paths; full URLs for any PR, issue, or ticket | A bare `#123` is unresolvable cold |
| No secret values, hostnames, or IPs — name where the value lives | The statement gets pasted into other tools and logs |
| Harness-neutral wording | It may be pasted into any agent CLI, not only the one that produced it |

## Step 4: Measure the cap

The 4000-character cap comes from Claude Code's goal feature, which is the
statement's most common consumer. Measure it. Never estimate.

Pipe the draft straight into `wc -m` — no file, no temp directory:

```bash
LC_ALL=en_US.UTF-8 wc -m <<'GOAL_EOF'
<the drafted goal statement, verbatim>
GOAL_EOF
```

`-m` counts characters, `-c` counts bytes. The cap is in characters, and these
statements routinely contain em-dashes and other multi-byte characters, so `-c`
over-reports and would trigger a cut the statement did not need.

**The locale prefix is load-bearing.** `wc -m` only counts characters inside a
UTF-8 locale; under `LC_ALL=C` it silently falls back to counting bytes and
becomes identical to `-c`. If `en_US.UTF-8` is unavailable, substitute any UTF-8
locale the system has — `C.UTF-8` is the usual one on Linux. Never drop the
prefix and rely on the ambient locale.

Read the number. Over the cap, cut in this order and re-measure after each cut:

1. Prose inside criteria — keep the condition, drop the explanation.
2. The objective's second sentence.
3. Background or motivation that is not a condition.

Never drop a criterion the work actually needs. If it still will not fit, print
it anyway, state the measured count, and say which criterion is at risk — an
honest over-cap statement beats a silently truncated one.

## Step 5: Print

**The statement is the body only — it never contains a heading.** That is what
makes it embeddable: a caller supplies whatever header its own format needs.

Invoked directly, wrap the body in this header so the user sees the count:

```text
## Goal statement (<N> chars)

<the statement body>
```

Invoked by another skill, return **only the body**, preceded by one line
carrying the measurement:

```text
chars: <N>
<the statement body>
```

`/handoff` supplies its own
`## Goal statement (paste as the session goal — <N> chars, under 4k)` header and
would otherwise emit two headings; it takes `<N>` from that line rather than
re-measuring, since this skill owns the count.

Print nothing else — no summary of what you did, no offer to write it somewhere.
Exactly two things may follow, each one line, only when true:

- A source was missing and changed the result.
- The statement is over the cap: name the criterion at risk. (The count is
  already reported, in the header or the `chars:` line.)

## Related Skills

- **handoff** (this plugin) — calls this skill for the goal half of its
  two-part cold-start artifact, then adds the reading list and hard rules.
- **session-status** (this plugin) — the done-versus-remaining view; use it when
  you want progress, not an objective.
- **karpathy-guidelines** (karpathy-skills) — verifiable success criteria and
  surfacing assumptions.
- **autoresearch:plan** — when the goal needs a measurable metric and an
  automated verify command rather than prose criteria.
- **writing-plans** (superpowers) — when the objective is settled and the next
  artifact is a plan.
