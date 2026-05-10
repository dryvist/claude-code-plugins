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

## Testing

### Branch Isolation in Guard Tests

`git-permission-guard.py` calls `_is_on_main_branch()` to gate `BLOCKED_ON_MAIN`
commands (`git commit`, `git add`, `git push`). Test files that invoke the guard
via `subprocess.run` must prevent this check from returning `True` when CI runs
against the `main` branch — otherwise BLOCKED_ON_MAIN fires before the path under
test is reached, masking real failures.

**Preferred — `GIT_GUARD_BRANCH_OVERRIDE` env var** (guard-level override, no
filesystem side-effects):

```python
import os

_TEST_ENV = {**os.environ, "GIT_GUARD_BRANCH_OVERRIDE": "feature"}

def run(cmd: str) -> dict:
    result = subprocess.run(
        ["python3", str(SCRIPT)],
        input=inp,
        capture_output=True,
        text=True,
        env=_TEST_ENV,
    )
```

**Alternative — temp directory `cwd`** (also isolates the test from the real repo):

```python
import atexit, shutil, tempfile

_TMPDIR = tempfile.mkdtemp(prefix="test_guard_")
atexit.register(shutil.rmtree, _TMPDIR, ignore_errors=True)

def run(cmd: str) -> dict:
    result = subprocess.run(
        ["python3", str(SCRIPT)],
        input=inp,
        capture_output=True,
        text=True,
        cwd=_TMPDIR,  # non-git dir: _is_on_main_branch() fails open
    )
```

Use `GIT_GUARD_BRANCH_OVERRIDE` when the test must run from the repo root (e.g.
to exercise git-aware behaviour). Use `cwd=_TMPDIR` when full filesystem isolation
is also required. Never omit both — BLOCKED_ON_MAIN will fire on `main`-branch CI
runs and mask the real test intent.