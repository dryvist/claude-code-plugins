#!/usr/bin/env python3
"""Tests for shlex ValueError handling in git-permission-guard.py.

Specifically covers the path introduced in the fix for false positives:
when shlex.split() raises ValueError on malformed shell input (e.g. unclosed
quotes), the guard treats the subcommand as non-matching (safe fail) rather
than falling back to str.split(), which would reintroduce false-positive denies.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).parent / "git-permission-guard.py"

# Use the guard's explicit testing override to bypass _is_on_main_branch()
# without relying on cwd manipulation. Any non-"main" value disables the check.
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
    if result.stdout.strip():
        return json.loads(result.stdout.strip())
    return {}


def check(label: str, cmd: str, expected_decision: str) -> bool:
    out = run(cmd)
    if not out:
        actual = "silent_allow"
    else:
        actual = out["hookSpecificOutput"]["permissionDecision"]

    ok = actual == expected_decision
    status = "PASS" if ok else "FAIL"
    print(f"{status} [{label}]: decision={actual}")
    if not ok:
        print(f"  Expected: {expected_decision}, Got: {actual}")
    return ok


all_pass = True

# --no-pager is now stripped by the extraction loop before -c is processed.
# The loop extracts -c core.hooksPath=/dev/null directly -> deny fires via the
# direct git_config_opts path even though the trailing commit message is
# malformed (unclosed quote). The shlex ValueError path is irrelevant here.
all_pass &= check(
    "--no-pager stripped; -c core.hooksPath extracted directly -> deny (shlex path irrelevant)",
    'git --no-pager -c core.hooksPath=/dev/null commit -m "unclosed',
    "deny",
)

# ValueError path: unclosed single quote with bypass pattern in subcommand text.
all_pass &= check(
    "ValueError: unclosed single-quote with hooksPath substring",
    "git --no-pager commit -m 'unclosed -c core.hooksPath=/dev/null bypass",
    "silent_allow",
)

# Sanity: well-formed bypass after an unrecognised global option still denies.
# (Ensures ValueError handling does not suppress legitimate bypass detection.)
all_pass &= check(
    "well-formed hooksPath bypass after unknown option still denies",
    "git --no-pager -c core.hooksPath=/dev/null commit -m msg",
    "deny",
)

# Sanity: bypass pattern appearing only inside a quoted commit message (valid
# shell) must remain a silent allow -- not denied.
all_pass &= check(
    "hooksPath pattern inside quoted commit message stays silent_allow",
    'git --no-pager commit -m "testing -c core.hooksPath=/dev/null semantics"',
    "silent_allow",
)

print()
print("ALL TESTS PASSED" if all_pass else "SOME TESTS FAILED")
sys.exit(0 if all_pass else 1)
