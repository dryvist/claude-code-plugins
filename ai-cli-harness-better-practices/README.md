# ai-cli-harness-better-practices

Harness-agnostic session continuity for AI CLI agents: know what you were doing,
prove what is actually done, and hand that to a session with no memory.

Every skill here runs without a git repository. When the working directory
happens to be one, the skills enrich their output with branch and PR state —
but none of them require it, and none of them fail without it.

## Skills

- **`/goal`** — Emit one objective statement, hard-capped under 4000 characters.
  Takes an optional focus hint like `/compact`. Reads only the conversation, the
  plan file, and the task list. No git, no network, no file writes.
- **`/session-status`** — Done-versus-remaining snapshot from the plan checklist
  and task list. `/session-status mid` gives a fast mid-flight orientation.
- **`/handoff`** — Paste-ready two-part artifact for a fresh session: the goal
  statement plus an unbounded prompt carrying the reading list, hard rules,
  pitfalls, and deliverables.
- **`/resume`** — Pick up unfinished work cold. Re-derives state from live
  evidence instead of trusting a prior summary.
- **`/replan`** — Rebuild a plan that no longer matches reality.
- **`/wrap-up`** — Decide whether the plan is actually complete, then emit the
  right forward artifact for either answer.

## Usage

```bash
/goal                                  # objective for the work in flight
/goal focus on auth, ignore the docs   # optional focus hint, like /compact
/session-status mid                    # quick done-vs-remaining snapshot
/handoff                               # paste-ready artifact for a fresh session
/resume                                # pick up cold; verifies before trusting
/replan                                # rebuild a plan that drifted from reality
/wrap-up                               # end-of-session verdict + forward artifact
```

`/goal` is the atom — it runs anywhere, needs no repository, and writes nothing.
The others build on it. In a git repository they add branch and PR facts; outside
one they say what they skipped and carry on.

## Why these are not in a git plugin

These skills read git the way they read the filesystem or CI: as one evidence
source among several. Filing them under a git plugin made a goal statement
impossible to get without a repository, which is backwards — the objective for a
session does not depend on version control.

## Related skills

This plugin deliberately does not reimplement work that already exists:

| Need | Use |
| --- | --- |
| Write an implementation plan from scratch | `superpowers:writing-plans` |
| Execute a written plan with checkpoints | `superpowers:executing-plans` |
| Turn a goal into a metric and verify command | `autoresearch:plan` |
| Verifiable success criteria, surfacing assumptions | `karpathy-skills:karpathy-guidelines` |
| Session retrospectives | `claude-retrospective:retrospecting` |
| Prose quality | `elements-of-style:writing-clearly-and-concisely` |

The git-side actions the continuity skills delegate to live in their own
plugins: `github-workflows:refresh-repo`, `github-workflows:gh-cli-patterns`,
and `commit-commands:clean_gone`.

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/ai-cli-harness-better-practices
```

## License

Apache-2.0
