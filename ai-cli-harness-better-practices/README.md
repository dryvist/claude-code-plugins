# ai-cli-harness-better-practices

Harness-agnostic session continuity for AI CLI agents: know what you were doing,
prove what is actually done, and hand that to a session with no memory.

Every skill here runs without a git repository. When the working directory
happens to be one, the skills enrich their output with branch and PR state —
but none of them require it, and none of them fail without it.

One documented exception: `/wrap-up purge-pr` closes a named PR and deletes its
branch and worktree. That is a repository operation by definition and needs one.
The default `/wrap-up` does not.

## Skills

- **`/wrap-up`** — Decide whether the plan is actually complete, then emit the
  right forward artifact for either answer. It composes `/agentops:research`,
  `/agentops:postmortem`, `/agentops:craft-goal` and `/agentops:doc`.
- **`/track-followups`** — File triaged follow-ups in the task tracker or the
  incident system; `/agentops:triage` decides untriaged items first.
- **Superseded shims** — `/goal` (use `/agentops:craft-goal`), `/session-status`,
  `/resume` and `/wrap-up-docs` (use `/agentops:doc`), `/replan` (use `/agentops:plan`).

## Usage

```bash
/wrap-up                               # end-of-session verdict + forward artifact
/wrap-up purge-pr 123                  # close one PR and purge its local state
/track-followups                       # file follow-ups in the right tracker
```

Both skills run without a repository. In a git repository they add branch and PR
facts; outside one they say what they skipped and carry on. The agentops plugin
supplies the goal, handoff, retrospective and triage skills they call.

## Why these are not in a git plugin

These skills read git the way they read the filesystem or CI: as one evidence
source among several. Filing them under a git plugin made a goal statement
impossible to get without a repository, which is backwards — the objective for a
session does not depend on version control.

## Related skills

This plugin deliberately does not reimplement work that already exists:

| Need | Use |
| --- | --- |
| Plan or re-plan a change | `agentops:plan` |
| Goal prompt with a finish line | `agentops:craft-goal` |
| Handoff, resume and docs | `agentops:doc` |
| Check whether a done claim holds | `agentops:research` |
| Session retrospectives | `agentops:postmortem` |
| Turn a goal into a metric and verify command | `autoresearch:plan` |
| Verifiable success criteria, surfacing assumptions | `karpathy-skills:karpathy-guidelines` |
| Prose quality | `elements-of-style:writing-clearly-and-concisely` |

The git-side actions the continuity skills delegate to live in their own
plugin: `github-workflows:refresh-repo`, `github-workflows:prune-branches`,
and `github-workflows:gh-cli-patterns`.

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/ai-cli-harness-better-practices
```

## License

Apache-2.0
