# git-guards — Test Authoring Guide

## Branch Isolation in Guard Tests

`git-permission-guard.py` calls `_is_on_main_branch()` to gate `BLOCKED_ON_MAIN`
commands (`git commit`, `git add`, `git push`). Test files that invoke the guard
via `subprocess.run` must prevent this check from returning `True` when CI runs
against the `main` branch — otherwise BLOCKED_ON_MAIN fires before the path under
test is reached, masking real failures.

**Preferred — `GIT_GUARD_BRANCH_OVERRIDE` env var** (guard-level override, no
filesystem side-effects):

```python
import json, os, subprocess
from pathlib import Path

SCRIPT = Path(__file__).parent / "git-permission-guard.py"
_TEST_ENV = {**os.environ, "GIT_GUARD_BRANCH_OVERRIDE": "feature"}


def run(cmd: str) -> dict:
    inp = json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}})
    result = subprocess.run(
        ["python3", str(SCRIPT)],
        input=inp,
        capture_output=True,
        text=True,
        env=_TEST_ENV,
    )
    return json.loads(result.stdout) if result.stdout.strip() else {}
```

**Alternative — temp directory `cwd`** (also isolates the test from the real repo):

```python
import atexit, json, shutil, subprocess, tempfile
from pathlib import Path

SCRIPT = Path(__file__).parent / "git-permission-guard.py"
_TMPDIR = tempfile.mkdtemp(prefix="test_guard_")
atexit.register(shutil.rmtree, _TMPDIR, ignore_errors=True)


def run(cmd: str) -> dict:
    inp = json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}})
    result = subprocess.run(
        ["python3", str(SCRIPT)],
        input=inp,
        capture_output=True,
        text=True,
        cwd=_TMPDIR,  # non-git dir: _is_on_main_branch() fails open
    )
    return json.loads(result.stdout) if result.stdout.strip() else {}
```

Use `GIT_GUARD_BRANCH_OVERRIDE` when the test must run from the repo root (e.g.
to exercise git-aware behavior). Use `cwd=_TMPDIR` when full filesystem isolation
is also required. Never omit both — BLOCKED_ON_MAIN will fire on `main`-branch CI
runs and mask the real test intent.
