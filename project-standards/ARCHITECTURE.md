# project-standards — Architecture

Meta-plugin governing the structure and conventions of all other plugins. Provides
authoring standards for Claude skills/agents/rules, workspace conventions, and a registry of all
available tools and skills.

## Integration Map

```mermaid
flowchart TD
    classDef ai fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
    classDef external fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c

    subgraph standards["project-standards (this plugin)"]
        AA["/claude-skill-authoring\ntoken budgets, progressive\ndisclosure, placement"]:::ai
        WS["/workspace-standards\nCross-project conventions,\nworktree layout, direnv"]:::ai
        SR["/skills-registry\nLookup table for all tools,\nskills, commands, agents"]:::ai
    end

    subgraph governed["All plugin development"]
        GW["git-workflows\nskills"]:::external
        GHW["github-workflows\nskills"]:::external
        CQR["codeql-resolver\nagents + skills"]:::external
        CS["code-standards\nskills"]:::external
        GS["git-standards\nskills"]:::external
        OTHER["Every other plugin..."]:::external
    end

    AA -.->|"governs structure of"| governed
    WS -.->|"governs workspace layout"| governed
    SR -.->|"indexes all components in"| governed
```

## Meta-Plugin Role

This plugin does not participate in any runtime workflow. It provides reference
documentation that governs how all other plugins are authored and organized:

- **/claude-skill-authoring** — token budgets, progressive disclosure, placement, naming
- **/workspace-standards** — worktree layout, cross-repo conventions, direnv
- **/skills-registry** — canonical lookup for discovering available capabilities
