# code-standards — Architecture

Passive knowledge plugin providing estate-specific code conventions. This skill is
loaded on demand — it does not run automatically like a hook.

## Integration Map

```mermaid
flowchart LR
    classDef ai fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
    classDef external fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c

    subgraph standards["code-standards (this plugin)"]
        CQS["/code-quality-standards\nLogging format, monitoring-vs-test\nphilosophy, doc format"]:::ai
    end

    subgraph consumers["Skills that load these standards"]
        SIMP["/simplify\n(external)"]:::external
        RCR["superpowers:\nreceiving-code-review\n(superpowers)"]:::external
    end

    CQS -.->|"informs code writing"| SIMP
    CQS -.->|"informs quality checks"| RCR
```

Generic review process, feedback format, and severity levels are covered by
`superpowers:receiving-code-review` and the official `code-review:code-review`
and `engineering:code-review` skills, not duplicated here.

## Passive vs Active

Standards plugins provide context when loaded — they do not block, intercept, or
modify operations. For active enforcement of coding patterns, see
[git-guards/ARCHITECTURE.md](../git-guards/ARCHITECTURE.md) and
[content-guards/ARCHITECTURE.md](../content-guards/ARCHITECTURE.md).
