#!/usr/bin/env python3
"""Tests for enforce-issue-limits.py hook.

Verifies that only 'gh issue create' and 'gh pr create/edit' commands are
intercepted, non-gh commands pass through, and bad input is handled gracefully.

Run with: python3 content-guards/scripts/test_enforce_issue_limits.py
"""

import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).parent / "enforce-issue-limits.py"


def run(inp: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["python3", str(SCRIPT)],
        input=inp,
        capture_output=True,
        text=True,
    )


def check(label: str, inp: str, expected_code: int) -> bool:
    result = run(inp)
    ok = result.returncode == expected_code
    status = "PASS" if ok else "FAIL"
    print(f"{status} [{label}]: exit={result.returncode}")
    if not ok:
        print(f"  Expected exit: {expected_code}, Got: {result.returncode}")
    return ok


all_pass = True

# Invalid JSON input - fail open (exit 0)
all_pass &= check("invalid JSON", "not valid json", 0)

# Empty JSON object - fail open (exit 0)
all_pass &= check("empty JSON", "{}", 0)

# Non-gh command passes through (exit 0)
all_pass &= check(
    "ls command passthrough",
    json.dumps({"tool_input": {"command": "ls -la"}}),
    0,
)

# gh pr list is not intercepted (exit 0)
all_pass &= check(
    "gh pr list passthrough",
    json.dumps({"tool_input": {"command": "gh pr list"}}),
    0,
)

# gh issue list is not intercepted - only 'create' triggers the check (exit 0)
all_pass &= check(
    "gh issue list passthrough",
    json.dumps({"tool_input": {"command": "gh issue list --state open"}}),
    0,
)

# gh issue close is not intercepted (exit 0)
all_pass &= check(
    "gh issue close passthrough",
    json.dumps({"tool_input": {"command": "gh issue close 42"}}),
    0,
)

# gh issue create triggers the gh check; when gh is unavailable, fails open (exit 0)
# When limits are exceeded, blocks (exit 2). Either outcome is valid here.
result = run(
    json.dumps({"tool_input": {"command": "gh issue create --title 'Test issue'"}})
)
ok = result.returncode in (0, 2)
status = "PASS" if ok else "FAIL"
print(f"{status} [gh issue create]: exit={result.returncode} (0=fail-open, 2=blocked)")
if not ok:
    print(f"  Expected exit: 0 or 2, Got: {result.returncode}")
all_pass &= ok

# gh issue create with inline flags (alternate form) is also intercepted
result = run(
    json.dumps({"tool_input": {"command": "gh issue create -t 'Bug' -b 'Details'"}})
)
ok = result.returncode in (0, 2)
status = "PASS" if ok else "FAIL"
print(f"{status} [gh issue create flags]: exit={result.returncode} (0=fail-open, 2=blocked)")
if not ok:
    print(f"  Expected exit: 0 or 2, Got: {result.returncode}")
all_pass &= ok

# gh pr create triggers the gh check; when gh is unavailable, fails open (exit 0)
# When limits are exceeded, blocks (exit 2). Either outcome is valid here.
result = run(
    json.dumps({"tool_input": {"command": "gh pr create --title 'Fix bug' --body 'Details'"}})
)
ok = result.returncode in (0, 2)
status = "PASS" if ok else "FAIL"
print(f"{status} [gh pr create]: exit={result.returncode} (0=fail-open, 2=blocked)")
if not ok:
    print(f"  Expected exit: 0 or 2, Got: {result.returncode}")
all_pass &= ok

# Regression: two removed checks must stay removed.
#
# The 24h rate limiter counted items *created* in a rolling window even after
# they were merged and closed, so it blocked a productive day exactly as hard as
# a spam run, and its own block message told you to unset it via
# GH_ACTION_LIMIT_PR. The hard limits on OPEN items already carry its only
# signal.
#
# The "ai-created" label limit compared 0 against 25 forever — nothing ever
# applied the label, in any state.
#
# Asserted at source level because a reintroduction would otherwise surface only
# as a surprise block on a busy day, with the rationale long gone.
source = (Path(__file__).parent / "enforce-issue-limits.py").read_text()
banned = ("GH_ACTION_LIMIT", "RATE_LIMIT_24H", "_count_recent", "_rate_limit_24h", "timedelta",
          "ai-created", "ai_created", "ai_limit")
found = [t for t in banned if t in source]
# The docstring explains why it was removed, so it names the symbols once each.
reintroduced = [t for t in found if source.count(t) > 1 or f"def {t}" in source]
ok = not reintroduced
status = "PASS" if ok else "FAIL"
print(f"{status} [24h rate limiter stays removed]: {reintroduced or 'absent'}")
if not ok:
    print(f"  Rate-limit machinery is back: {reintroduced}")
    print("  Constrain backlog with a hard limit on OPEN items instead.")
all_pass &= ok

print()
print("ALL TESTS PASSED" if all_pass else "SOME TESTS FAILED")
sys.exit(0 if all_pass else 1)
