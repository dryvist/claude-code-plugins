# git-workflows — Architecture

Local git operations: branch sync, troubleshooting, and post-merge cleanup.
For PR-related operations (refresh, rebase-merge, finalize, squash-merge), see
[github-workflows/ARCHITECTURE.md](../github-workflows/ARCHITECTURE.md).

## Skill Map

```mermaid
flowchart TD
    classDef ai fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
    classDef external fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c

    subgraph maintenance["Maintenance"]
        sync_main["/sync-main"]
    end

    subgraph troubleshooting["Troubleshooting"]
        ts_rebase["/troubleshoot-rebase"]
        ts_precommit["/troubleshoot-precommit"]
        ts_worktree["/troubleshoot-worktree"]
    end

    subgraph cleanup["Cleanup"]
        wrap_up["/wrap-up"]
    end

    subgraph external_deps["External"]
        superpowers["superpowers:\nusing-git-worktrees"]:::external
        clean_gone["/clean_gone\n(commit-commands)"]:::external
        retrospecting["/retrospecting quick\n(claude-retrospective)"]:::external
        refresh_repo["/refresh-repo\n(github-workflows)"]:::external
    end

    wrap_up -->|"Step 1"| refresh_repo
    wrap_up -->|"Step 2"| retrospecting
    wrap_up -->|"Step 3"| clean_gone
    wrap_up -->|"Step 4"| follow_up["Follow-up prompt\n(built-in)"]:::ai

    ts_worktree -.->|"worktree guidance"| superpowers

    class sync_main,ts_rebase,ts_precommit,ts_worktree,wrap_up ai
```

## /wrap-up Composition

```mermaid
flowchart LR
    classDef ai fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
    classDef external fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c

    wrap_up["/wrap-up\ngit-workflows"]:::ai

    subgraph github_wf["github-workflows plugin"]
        refresh_repo["/refresh-repo"]:::external
    end

    subgraph retro["claude-retrospective plugin"]
        retrospecting["/retrospecting quick"]:::external
    end

    subgraph commits["commit-commands plugin"]
        clean_gone["/clean_gone"]:::external
    end

    subgraph builtin["AI analysis + gh issue list + Zammad tickets"]
        follow_up["Follow-up prompt\ngeneration"]:::ai
    end

    wrap_up -->|"1. sync + readiness check"| refresh_repo
    wrap_up -->|"2. session retrospective"| retrospecting
    wrap_up -->|"3. prune gone branches"| clean_gone
    wrap_up -->|"4. follow-up prompt"| follow_up
```

## Plugin Boundary: Local vs GitHub

```mermaid
flowchart LR
    classDef ai fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
    classDef external fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c

    subgraph local["git-workflows — LOCAL git operations"]
        direction TB
        sync_main["/sync-main\ngit pull, branch sync"]:::ai
        ts["/troubleshoot-*\nrebase, precommit, worktree"]:::ai
        wrap_up["/wrap-up\nend-of-session cleanup"]:::ai
    end

    subgraph remote["github-workflows — GITHUB API operations"]
        direction TB
        refresh_repo["/refresh-repo"]:::external
        rebase_pr["/rebase-pr"]:::external
        finalize_pr["/finalize-pr"]:::external
        squash_merge_pr["/squash-merge-pr"]:::external
        resolve_threads["/resolve-pr-threads"]:::external
        shape_issues["/shape-issues"]:::external
        trigger_reviews["/trigger-ai-reviews"]:::external
    end

    local -- "hands off after\npush to remote" --> remote
```
