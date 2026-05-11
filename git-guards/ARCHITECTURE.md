# git-guards — Architecture

Always-on protection through three hooks that intercept operations across every workflow.
Unlike guidance-based plugins that load on demand, these hooks run unconditionally for
every user prompt and every tool invocation.

## Hook Interception Map

```mermaid
flowchart TD
    UP["User Prompt Submitted"]
    PT_BASH["PreToolUse: Bash"]
    PT_EDIT["PreToolUse: Edit / Write / NotebookEdit"]

    UP -->|"matcher: *"| WR["worktree-reminder.sh\n(UserPromptSubmit)"]
    PT_BASH -->|"matcher: Bash"| PG["git-permission-guard.py\n(PreToolUse)"]
    PT_BASH -->|"matcher: Bash"| TG["commit-trailer-guard.py\n(PreToolUse)"]
    PT_EDIT -->|"matcher: Edit, Write, NotebookEdit"| MBG["main-branch-guard.py\n(PreToolUse)"]

    WR --> WR_CHECK{"In a\nworktree?"}
    WR_CHECK -->|Yes| WR_ALLOW["Allow — no reminder"]
    WR_CHECK -->|No| WR_WARN["Inject worktree reminder"]

    PG --> PG_CLASSIFY{"Classify\ncommand"}
    PG_CLASSIFY -->|"force-push to main\nhook bypass --no-verify\nmerge on main\nhard reset\nbranch -D on main\ngh pr comment"| PG_BLOCK["permissionDecision: deny\n(BLOCKED)"]
    PG_CLASSIFY -->|"merge, rebase\nforce-push to branch\nworktree remove"| PG_CONFIRM["permissionDecision: ask\n(CONFIRM)"]
    PG_CLASSIFY -->|"Everything else"| PG_ALLOW["exit 0 / no decision\n(allowed)"]

    MBG --> MBG_CHECK{"On main\nbranch?"}
    MBG_CHECK -->|No / local-only file| MBG_ALLOW["exit 0 / no decision\n(allowed)"]
    MBG_CHECK -->|Yes & not exempt| MBG_BLOCK["permissionDecision: deny\n(force worktree workflow)"]

    classDef hook fill:#fff3e0,stroke:#e65100,color:#bf360c
    classDef block fill:#ffebee,stroke:#c62828,color:#b71c1c
    classDef allow fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20

    class WR,PG,MBG hook
    class PG_BLOCK,PG_CONFIRM,MBG_BLOCK block
    class WR_ALLOW,PG_ALLOW,MBG_ALLOW allow
```

## Always-On Nature

These hooks wrap around every other plugin operation. No workflow bypasses them.

```mermaid
flowchart LR
    subgraph OUTER["git-guards — always active"]
        direction TB
        WR2["worktree-reminder.sh\nfires on every prompt"]
        PG2["git-permission-guard.py\nfires on every Bash call"]
        TG2["commit-trailer-guard.py\nfires on every Bash call"]
        MBG2["main-branch-guard.py\nfires on every file edit"]

        subgraph INNER["All other plugin operations"]
            direction LR
            SHIP["/ship"]
            FINALIZE["/finalize-pr"]
            REBASE["/rebase-pr"]
            MANUAL["Manual edits"]
            OTHER["Any workflow..."]
        end

        WR2 -.->|wraps| INNER
        PG2 -.->|wraps| INNER
        MBG2 -.->|wraps| INNER
    end

    classDef hook fill:#fff3e0,stroke:#e65100,color:#bf360c
    class WR2,PG2,MBG2 hook
```

## Fail-Open Philosophy

Every hook follows a strict fail-open contract: if the hook errors or crashes, it exits 0
with no decision and the operation proceeds. Blocking is signalled by emitting a JSON
`permissionDecision` (`deny` or `ask`) on stdout while still exiting 0; the worktree
reminder writes a stderr message instead. The legacy exit-2 path (still used by
`worktree-reminder.sh`) is preserved for shell hooks but no longer used by the Python
guards.

| Outcome | Mechanism | Effect |
|---------|-----------|--------|
| Intentional allow | exit 0, no decision | Operation proceeds |
| Intentional block | exit 0 with `permissionDecision: deny` | Operation denied |
| User confirmation | exit 0 with `permissionDecision: ask` | User prompted |
| Hook crash / error | exit 0 (no JSON) | Fail-open — proceeds anyway |

## Relationship to git-standards

git-guards and git-standards are complementary: one enforces, one advises.

| Dimension | git-guards | git-standards |
|-----------|-----------|---------------|
| Activation | Automatic — every operation | On demand — loaded when relevant |
| Mechanism | Hook exit codes (0/2) | Skill text injected into context |
| Effect | Hard block or reminder | Soft guidance and conventions |
| Scope | Runtime tool calls | Planning and workflow decisions |
