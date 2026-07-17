# content-guards — Architecture

Pre-flight and post-flight content validation through 6 hooks across PreToolUse and
PostToolUse events. These run automatically on every qualifying tool call.

## Validation Pipeline

```mermaid
flowchart TD
    classDef pre fill:#fff3e0,stroke:#e65100,color:#bf360c
    classDef post fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
    classDef tool fill:#f5f5f5,stroke:#616161,color:#212121

    subgraph PRE ["PreToolUse — before content is written"]
        direction TB
        TV["validate-token-limits.py\nmatcher: Write | Edit"]:::pre
        WG["webfetch-guard.py\nmatcher: WebFetch | WebSearch"]:::pre
        IL["enforce-issue-limits.py\nmatcher: Bash"]:::pre
    end

    TOOL["Tool executes\n(Write, Edit, Bash, WebFetch)"]:::tool

    subgraph POST ["PostToolUse — after content is written"]
        direction TB
        MV["validate-markdown.sh\nmatcher: Write | Edit"]:::post
        RV["validate-readme.py\nmatcher: Write | Edit"]:::post
    end

    PRE -->|"pass (exit 0)"| TOOL
    PRE -->|"block (exit 2)"| BLOCKED["Operation denied"]
    TOOL --> POST
    POST -->|"warn"| WARN["Lint warnings injected\ninto assistant context"]

    classDef block fill:#ffebee,stroke:#c62828,color:#b71c1c
    class BLOCKED block
```

## Hook Details

| Hook | Event | Matcher | What It Does |
|------|-------|---------|-------------|
| token-validator | PreToolUse | Write, Edit | Blocks files exceeding token limits |
| leakage-guard | PreToolUse | Write, Edit | Blocks private host IPs / VMIDs in public-repo writes |
| webfetch-guard | PreToolUse | WebFetch, WebSearch | Blocks outdated year references in queries |
| issue-limiter | PreToolUse | Bash | Caps OPEN issues/PRs, blocks duplicate titles |
| markdown-validator | PostToolUse | Write, Edit | Runs markdownlint on written files |
| readme-validator | PostToolUse | Write, Edit | Checks README required sections and badges |

## Where Guards Fire

These hooks run on every file write across all workflows — `/ship`, `/finalize-pr`,
`/resolve-pr-threads`, manual edits, and any other skill that writes files.

See [git-guards/ARCHITECTURE.md](../git-guards/ARCHITECTURE.md) for the companion
runtime protection hooks.
