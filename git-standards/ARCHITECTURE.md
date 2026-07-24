# git-standards — Architecture

Passive knowledge plugin providing git workflow conventions and PR standards. Loaded on
demand — for active enforcement, see
[git-guards/ARCHITECTURE.md](../git-guards/ARCHITECTURE.md).

## Integration Map

```mermaid
flowchart LR
    classDef ai fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
    classDef external fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c

    subgraph standards["git-standards (this plugin)"]
        GWS["/git-workflow-standards\nWorktree structure, branch naming,\nhygiene, merge strategy"]:::ai
        PS["/pr-standards\nPR guards, issue linking,\nno-AI-mentions, review process"]:::ai
    end

    subgraph consumers["Skills that load these standards"]
        SM["/sync-main\n(git-workflows)"]:::external
        RR["/refresh-repo\n(git-workflows)"]:::external
        PB["/prune-branches\n(git-workflows)"]:::external
        RP["/rebase-pr\n(git-workflows)"]:::external
        SHIP["/ship\n(github-workflows)"]:::external
        FPR["/finalize-pr\n(github-workflows)"]:::external
        SI["/shape-issues\n(github-workflows)"]:::external
    end

    GWS -.->|"informs branch ops"| SM
    GWS -.->|"informs cleanup"| PB
    GWS -.->|"informs merge"| RP
    PS -.->|"informs PR creation"| SHIP
    PS -.->|"informs PR finalization"| FPR
    PS -.->|"informs issue shaping"| SI
```

## Standards vs Enforcement

| Dimension | git-standards (this plugin) | git-guards |
|-----------|---------------------------|-----------|
| Activation | On demand | Automatic — every operation |
| Mechanism | Skill text injected into context | Hook exit codes (0/2) |
| Effect | Soft guidance and conventions | Hard block or reminder |
| Scope | Planning and workflow decisions | Runtime tool calls |
