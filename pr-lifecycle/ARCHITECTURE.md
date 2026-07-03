# pr-lifecycle — Architecture

PostToolUse hook that bridges PR creation to PR finalization. Detects successful
`gh pr create` commands and automatically triggers `/finalize-pr`.

## Bridge Diagram

```mermaid
flowchart LR
    classDef ai fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
    classDef hook fill:#fff3e0,stroke:#e65100,color:#bf360c
    classDef external fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c

    CREATE["gh pr create\n(any caller)"]:::ai
    HOOK["post-pr-create.sh\n(PostToolUse: Bash)"]:::hook
    DETECT{"PR URL in\noutput?"}
    EMIT["Emit systemMessage:\ninvoke /finalize-pr #N"]:::hook
    FINALIZE["/finalize-pr\n(github-workflows)"]:::external
    SKIP["No action"]

    CREATE --> HOOK --> DETECT
    DETECT -->|"Yes"| EMIT --> FINALIZE
    DETECT -->|"No"| SKIP
```

## Callers

| Caller | Uses pr-lifecycle hook? |
|--------|----------------------|
| `/commit-push-pr` (commit-commands) | Yes — hook fires after `gh pr create` |
| `/ship` (github-workflows) | Yes, but its systemMessage is ignored — `/ship` invokes `/finalize-pr` directly |
| Manual `gh pr create` | Yes — hook fires on any Bash `gh pr create` |

When `/ship` is the orchestrator, it suppresses this hook's systemMessage and invokes
`/finalize-pr` itself with the context brief from Step 1.5.

## Cross-References

- [github-workflows/ARCHITECTURE.md](../github-workflows/ARCHITECTURE.md) — master
  pipeline showing where this hook fits
