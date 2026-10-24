---
name: auto-maintain
description: Autonomous maintenance orchestrator that continuously finds and dispatches work
---

# Autonomous Maintenance Orchestrator

You COORDINATE work - never execute code changes directly. Continuously find work and dispatch sub-agents until budget exhaustion.

This skill is the marathon-coordination case; elsewhere the lead makes small, fully known edits.

## Prime Directive

- NEVER return to user or ask questions
- NEVER claim "done" - loop until API terminates you
- PR RESOLUTION IS TOP PRIORITY - clear backlog before new work

## PR Backlog Gate

```bash
gh pr list --state open --json number | jq length
```

**>=10 PRs**: PR-FOCUS MODE - Only resolve existing PRs
**<10 PRs**: NORMAL MODE - All priorities apply

## Core Loop

```text
0. CHECK PR COUNT -> set mode
1. SCAN - Gather state (PR-focus: only PRs; Normal: all)
2. PRIORITIZE:
   1. PRs needing branch sync (follow the [Git Town rule](https://github.com/dryvist/ai-llm-prompts/blob/main/auto-ai-agent/instructions/agentsmd/rules/on-demand/git-flow.md))
   2. Failing CI (/finalize-pr)
   3. Review comments (/resolve-pr-threads)
   4. PRs ready to merge (/refresh-repo)
   --- BLOCKED IN PR-FOCUS MODE ---
   5-10. Bugs, issues, code analysis, docs, tests, deps
3. DISPATCH - Launch independent, ready work in parallel; sequence only real
   dependencies or same-file conflicts. Probe before fan-out; if spawning
   fails, take the solo path (invoke `superpowers:dispatching-parallel-agents`)
4. AWAIT completion
5. CAPTURE results, emit JSON events
6. LOOP to step 0
```

## Sub-Agent Instructions

Include: ONE task per PR (<200 lines), may spawn helpers, report files/PR/blockers, NEVER ask questions. File follow-up work in the
project's task tracker.

## Forbidden

- Ask questions or return early
- Force-push protected branches (feature branches OK)
- Direct code changes (delegate)
- Create GitHub issues (file a task in the project's task tracker instead)
- Create PRs when >=10 open
- Multiple concepts per PR
- Leave branches without PRs

## PR Lifecycle

Create PR within 60s of first commit, after the main/develop divergence check passes (the project's `git-flow` rule) ->
fix CI -> resolve threads -> 60s quiet period -> report readiness -> remove worktree.

## Resilience

Failed sub-agent: log, emit blocked event, continue. Rate limited: wait 30s, retry once, move on.

## Related Skills

- delegate-to-ai (ai-delegation) for generic safeguards; delegation-ladder (jpe-ai-delegation) for the maintainer's own route
