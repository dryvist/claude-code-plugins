# github-workflows — Architecture

Cross-plugin integration diagrams for the `github-workflows` plugin. This is the master
pipeline reference for the full PR lifecycle, from uncommitted changes through post-merge cleanup.

---

## Legend

```mermaid
graph LR
    A[AI Step]:::ai
    B[Human Step]:::human
    C[Hook Interception]:::hook
    D[External Plugin Dep]:::external

    classDef ai fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
    classDef human fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
    classDef hook fill:#fff3e0,stroke:#e65100,color:#bf360c
    classDef external fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
```

---

## 1. Skill Dependency Map

All skills and their cross-plugin dependencies. `/refresh-repo`,
`/prune-branches`, `/rebase-pr`, `/merge-pr`, `/pr-stacks`, and
`/gh-cli-patterns` are local to this plugin (no cross-plugin hop) —
`/merge-pr` and `/rebase-pr` consume the canonical PR-readiness gate and the
default-branch detection from `/gh-cli-patterns` directly. `/merge-pr` arms
native auto-merge with `gh pr merge --auto`. On a git-flow repo, `/rebase-pr`
refuses a `main`-targeting PR outright, and `/merge-pr` aborts a `develop` →
`main` promotion PR. Promotion to `main` is daily and automatic; agents do not
promote by hand.

```mermaid
flowchart TD
    SHIP["/ship"]:::ai
    FPR["/finalize-pr"]:::ai
    RPT["/resolve-pr-threads"]:::ai
    SMP["/merge-pr"]:::ai
    RBP["/rebase-pr"]:::ai
    RFR["/refresh-repo"]:::ai
    PBR["/prune-branches"]:::ai
    GCP["/gh-cli-patterns"]:::ai
    TAR["/trigger-ai-reviews"]:::ai
    SI["/shape-issues"]:::ai

    CPR["Commit + /simplify + validate\n+ push + PR create (inline)"]:::ai
    RCQ["/resolve-codeql\n(codeql-resolver)"]:::external
    SIMP["/simplify\n(external)"]:::external
    RCR["superpowers:receiving-code-review\n(superpowers, external)"]:::external
    CLAUDE["Claude bot review"]:::external
    GEMINI["Gemini bot review"]:::external
    COPILOT["Copilot reviewer"]:::external

    SHIP -->|"invokes"| CPR
    SHIP -->|"invokes"| FPR

    SHIP -->|"pre-push"| SIMP
    FPR -->|"Phase 2.3.5"| SIMP
    FPR -->|"Phase 2.2"| RCQ
    FPR -->|"Phase 2.2"| RPT

    RPT -->|"Step 3"| RCR

    FPR -.->|"reference"| GCP
    SHIP -.->|"reference"| GCP
    SMP -.->|"reference"| GCP
    RBP -.->|"reference"| GCP
    RFR -.->|"reference"| GCP
    RPT -.->|"reference"| GCP

    TAR -->|"triggers"| CLAUDE
    TAR -->|"triggers"| GEMINI
    TAR -->|"triggers"| COPILOT

    classDef ai fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
    classDef external fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
```

`/shape-issues` is standalone — uses Shape Up methodology with no runtime dependency
on other plugins.

---

## 2. The Ship Pipeline

The complete end-to-end journey from uncommitted changes to a merged, clean repository.

```mermaid
flowchart TD
    subgraph AI_SHIP ["AI — Automated (/ship)"]
        direction TB
        S0["Verify working directory"]:::ai
        S1["Detect uncommitted changes"]:::ai
        S2["Commit, /simplify, validate,\npush, PR create (inline)"]:::ai
        S3["Build context brief\n(purpose, decisions, scope)"]:::ai
        S5["Invoke /finalize-pr\n(sequential per PR)"]:::ai

        subgraph FINALIZE ["AI — /finalize-pr phases"]
            direction TB
            F1["Phase 1: Discover + confirm PRs"]:::ai
            F15["Phase 1.5: Build context brief\n(if standalone invocation)"]:::ai
            F21["Phase 2.1: Start CI monitoring\n(background Task agent)"]:::ai
            F22A["Phase 2.2a: Fix CodeQL\n/resolve-codeql (codeql-resolver)"]:::external
            F22B["Phase 2.2b: Fix review threads\n/resolve-pr-threads"]:::ai
            F22C["Phase 2.2c: Fix merge conflicts"]:::ai
            F23["Phase 2.3: Fix CI failures"]:::ai
            F235["Phase 2.3.5: /simplify\nfinal pass"]:::external
            F24["Phase 2.4: Health check"]:::ai
            F3["Phase 3: Pre-handoff verification\nCodeQL, threads, conflicts,\nsimplified, CI, local lint"]:::ai
            F4["Phase 4: Update PR metadata\n(a delegate (routing per core AGENTS.md))"]:::ai
            F5["Phase 5: Report ready"]:::ai
        end

        S0 --> S1 --> S2 --> S3 --> S5
        S5 --> F1 --> F15 --> F21
        F21 --> F22A & F22B & F22C
        F22A & F22B & F22C --> F23 --> F235 --> F24 --> F3 --> F4 --> F5
    end

    subgraph MERGE ["AI — Arm auto-merge (/merge-pr)"]
        direction TB
        M0["Step 0: abort a develop → main promotion PR\non a git-flow repo"]:::ai
        M1["Validate readiness\n(/gh-cli-patterns PR-readiness gate)"]:::ai
        M2["Merge commit (default)\nor generate squash message (--squash)"]:::ai
        M3["gh pr merge --auto --merge\nor --auto --squash"]:::ai
        M4["After merge: git switch base branch && git pull"]:::ai

        M0 --> M1 --> M2 --> M3
    end

    subgraph PLATFORM ["Platform — native auto-merge"]
        direction TB
        P1["Required checks pass:\ngate / Merge Gate + AI Merge Gate"]:::ai
        P2["Platform merges the PR\nNo person approves or clicks merge\nOnly hold: label human:review"]:::ai

        P1 --> P2
    end

    subgraph CLEANUP ["AI — On Human Command (/wrap-up from ai-cli-harness-better-practices)"]
        direction TB
        W1["/refresh-repo\n(this plugin)"]:::ai
        W2["/retrospecting quick\n(claude-retrospective, external)"]:::external
        W3["/prune-branches\n(this plugin)"]:::ai
        W4["Summary report"]:::ai

        W1 --> W3 --> W4
        W2 --> W4
    end

    F5 --> M0
    M3 --> P1
    P2 --> M4
    M4 --> CLEANUP

    classDef ai fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
    classDef human fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
    classDef hook fill:#fff3e0,stroke:#e65100,color:#bf360c
    classDef external fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
```

---

## 3. Guard Integration

`git-guards` and `content-guards` hooks intercept tool calls throughout the entire pipeline.
They fire automatically on every `Bash`, `Write`, `Edit`, and `NotebookEdit` call made by
any skill — they are not invoked explicitly.

See [git-guards/ARCHITECTURE.md](../git-guards/ARCHITECTURE.md) and
[content-guards/ARCHITECTURE.md](../content-guards/ARCHITECTURE.md) for details.

---

## 4. Cross-References

- [codeql-resolver/ARCHITECTURE.md](../codeql-resolver/ARCHITECTURE.md) — 3-tier
  architecture (invoked by `/finalize-pr` Phase 2.2)
- [git-workflows/ARCHITECTURE.md](../git-workflows/ARCHITECTURE.md) — `/troubleshoot-*`
- [ai-cli-harness-better-practices/ARCHITECTURE.md](../ai-cli-harness-better-practices/ARCHITECTURE.md)
  — `/goal`, `/resume`, `/replan`, `/session-status`, `/wrap-up`
  bridging `gh pr create` to `/finalize-pr`
- [git-guards/ARCHITECTURE.md](../git-guards/ARCHITECTURE.md) — PreToolUse hooks
- [content-guards/ARCHITECTURE.md](../content-guards/ARCHITECTURE.md) — Content validation
- [code-standards/ARCHITECTURE.md](../code-standards/ARCHITECTURE.md) — Quality standards
