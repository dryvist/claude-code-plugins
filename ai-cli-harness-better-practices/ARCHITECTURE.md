# ai-cli-harness-better-practices — Architecture

Session continuity for AI CLI harnesses. No skill here requires a git
repository; git and GitHub are optional enrichment, guarded per skill.

## Skill Map

```mermaid
flowchart TD
    classDef ai fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
    classDef external fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c

    subgraph core["Harness core (no git required)"]
        goal["/goal"]
        status["/session-status"]
        handoff["/handoff"]
        resume["/resume"]
        replan["/replan"]
        wrapup["/wrap-up"]
    end

    subgraph optional["Optional git enrichment"]
        refresh["/refresh-repo\n(github-workflows)"]:::external
        ghcli["/gh-cli-patterns\n(github-workflows)"]:::external
        cleangone["/clean_gone\n(commit-commands)"]:::external
    end

    subgraph referred["Referred out, never rebuilt"]
        retro["/retrospecting\n(claude-retrospective)"]:::external
        karpathy["karpathy-guidelines\n(karpathy-skills)"]:::external
        plans["writing-plans\n(superpowers)"]:::external
        arplan["autoresearch:plan"]:::external
    end

    wrapup --> status
    wrapup --> handoff
    wrapup --> retro
    wrapup -.->|"if git repo"| refresh
    wrapup -.->|"if git repo"| cleangone

    status --> handoff
    status -.->|"if git repo"| ghcli

    handoff --> goal
    goal -.->|"criteria quality"| karpathy

    resume --> replan
    replan -.->|"write from scratch"| plans
    replan -.->|"needs a metric"| arplan

    class goal,status,handoff,resume,replan,wrapup ai
```

## The git guard

Every enrichment section is gated by one check:

```bash
git rev-parse --is-inside-work-tree >/dev/null 2>&1
```

Success runs the section. Failure skips it and the skill states the omission in
its output. Nothing errors; nothing is silently dropped.

**The guard proves repo-ness, not GitHub reachability.** They are different
conditions and a repository can satisfy the first while failing the second: no
`origin` remote, a non-GitHub remote, `gh` not installed, or `gh` unauthenticated.
So any `gh` call inside a gated block carries its own failure handling — treat a
non-zero `gh` exit as "unknown", never as "none found", and say which check did
not run. Reporting an unchecked list as clean is the failure this whole design
exists to prevent.

Commands that name a default branch use the repository's actual default, not a
hardcoded `main`:

```bash
git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null   # e.g. origin/develop
```

## /goal composition

`/goal` is the atom. It has no dependencies, reads no repository, and writes no
files. `/handoff` calls it for the goal half of its artifact rather than
carrying a second definition of what a goal statement is.

```mermaid
flowchart LR
    classDef ai fill:#e3f2fd,stroke:#1565c0,color:#0d47a1

    args["focus argument\n(optional)"] --> goal
    convo["conversation\n(recent pivots)"] --> goal
    plan["plan file\n(if any)"] --> goal
    tasks["TaskList\n(if any)"] --> goal
    goal["/goal"]:::ai --> out["## Goal statement\n< 4000 chars, measured"]
```

Any missing input is skipped. All three state sources missing still yields a
goal derived from the conversation alone.
