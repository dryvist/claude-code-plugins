#!/usr/bin/env python3
"""Tests for main-branch-guard.py semantic branch detection."""

import atexit
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).parent / "main-branch-guard.py"

# ---------------------------------------------------------------------------
# Git fixtures
# ---------------------------------------------------------------------------

_BASE = tempfile.mkdtemp(prefix="test_mbg_")
atexit.register(shutil.rmtree, _BASE, ignore_errors=True)


def _git(*args, cwd):
    subprocess.run(["git"] + list(args), cwd=cwd, capture_output=True, check=True)


def _setup_fixtures():
    base = Path(_BASE)

    # --- Primary fixture: bare repo + main worktree + feature worktree ---
    bare = base / "repo.git"
    main_wt = base / "main"
    feat_wt = base / "feature" / "x"

    _git("init", "--bare", str(bare), cwd=_BASE)

    # Seed the bare repo via a temporary clone
    seed = base / "_seed"
    _git("clone", str(bare), str(seed), cwd=_BASE)
    _git("config", "user.email", "t@t.com", cwd=str(seed))
    _git("config", "user.name", "T", cwd=str(seed))
    (seed / "init.txt").write_text("init")
    _git("add", "init.txt", cwd=str(seed))
    _git("commit", "--no-gpg-sign", "-m", "init", cwd=str(seed))
    _git("push", "origin", "HEAD:main", cwd=str(seed))
    _git("checkout", "-b", "feature/x", cwd=str(seed))
    _git("push", "origin", "HEAD:feature/x", cwd=str(seed))
    shutil.rmtree(str(seed))

    # Worktrees from the bare repo
    main_wt.mkdir(parents=True)
    _git("worktree", "add", str(main_wt), "main", cwd=str(bare))
    _git("config", "user.email", "t@t.com", cwd=str(main_wt))
    _git("config", "user.name", "T", cwd=str(main_wt))

    feat_wt.parent.mkdir(parents=True)
    _git("worktree", "add", str(feat_wt), "feature/x", cwd=str(bare))

    # --- Alt fixture: non-"main"-named dir on main branch ---
    alt = base / "alt-trunk"
    _git("init", "-b", "main", str(alt), cwd=_BASE)
    _git("config", "user.email", "t@t.com", cwd=str(alt))
    _git("config", "user.name", "T", cwd=str(alt))
    (alt / "init.txt").write_text("init")
    _git("add", "init.txt", cwd=str(alt))
    _git("commit", "--no-gpg-sign", "-m", "init", cwd=str(alt))

    return bare, main_wt, feat_wt, alt


_BARE: Path = Path("/nonexistent")
_MAIN_WT: Path = Path("/nonexistent")
_FEAT_WT: Path = Path("/nonexistent")
_ALT_WT: Path = Path("/nonexistent")
_FIXTURE_OK = False
try:
    _BARE, _MAIN_WT, _FEAT_WT, _ALT_WT = _setup_fixtures()
    _FIXTURE_OK = True
except FileNotFoundError:
    print("SKIP: git not found, skipping worktree tests", file=sys.stderr)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def run_edit(file_path: str) -> dict:
    inp = json.dumps({"tool_name": "Edit", "tool_input": {"file_path": file_path}})
    result = subprocess.run(
        ["python3", str(SCRIPT)],
        input=inp,
        capture_output=True,
        text=True,
    )
    if result.stdout.strip():
        return json.loads(result.stdout.strip())
    return {}


def check(label: str, file_path: str, expected: str) -> bool:
    out = run_edit(file_path)
    actual = out["hookSpecificOutput"]["permissionDecision"] if out else "silent_allow"
    ok = actual == expected
    print(f"{'PASS' if ok else 'FAIL'} [{label}]: decision={actual}")
    if not ok:
        print(f"  Expected: {expected}, Got: {actual}")
    return ok


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

all_pass = True

# Non-git path: always allow
all_pass &= check("non-git /tmp file", "/tmp/scratch.txt", "silent_allow")

if _FIXTURE_OK:
    # 1. Edit in main worktree → denied
    all_pass &= check(
        "main worktree deny",
        str(_MAIN_WT / "init.txt"),
        "deny",
    )

    # 2. Edit in feature worktree → allowed
    all_pass &= check(
        "feature worktree allow",
        str(_FEAT_WT / "init.txt"),
        "silent_allow",
    )

    # 3. Edit inside bare repo directory → allowed (bare repo is not a work tree)
    all_pass &= check(
        "bare repo dir allow",
        str(_BARE / "config"),
        "silent_allow",
    )

    # 4. Edit in alt-trunk worktree (dir NOT named "main", branch IS main) → denied
    all_pass &= check(
        "non-conventional layout deny",
        str(_ALT_WT / "init.txt"),
        "deny",
    )

    # 5. *.local.* file in main worktree → exempt (allowed)
    local_file = _MAIN_WT / "settings.local.json"
    local_file.write_text("{}")
    all_pass &= check(
        "local-exempt file in main",
        str(local_file),
        "silent_allow",
    )
else:
    print("SKIP: git fixture unavailable, skipping worktree tests")

print()
print("ALL TESTS PASSED" if all_pass else "SOME TESTS FAILED")
sys.exit(0 if all_pass else 1)
