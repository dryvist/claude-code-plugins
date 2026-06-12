#!/usr/bin/env python3
"""Tests for gh-specific ASK/DENY decisions in git-permission-guard.py."""

import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).parent / "git-permission-guard.py"


def run(cmd: str) -> dict:
    inp = json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}})
    result = subprocess.run(
        ["python3", str(SCRIPT)],
        input=inp,
        capture_output=True,
        text=True,
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

# DENY_GH: gh pr comment must be denied (use review threads instead)
all_pass &= check("gh pr comment deny", "gh pr comment 42 --body 'looks good'", "deny")
# gh pr comment with --body flag variant
all_pass &= check("gh pr comment -b flag", "gh pr comment 42 -b 'feedback here'", "deny")

# ASK_GH: formerly asked confirmation, now silent-allowed
all_pass &= check("gh repo delete silent", "gh repo delete owner/repo", "silent_allow")
all_pass &= check("gh release delete silent", "gh release delete v1.0.0", "silent_allow")
all_pass &= check("gh issue close silent", "gh issue close 123", "silent_allow")
all_pass &= check("gh pr close silent", "gh pr close 42", "silent_allow")
all_pass &= check("gh pr merge silent", "gh pr merge 42 --squash", "silent_allow")

# Silent-allow: safe gh read commands must not be blocked
all_pass &= check("gh pr list silent", "gh pr list", "silent_allow")
all_pass &= check("gh issue list silent", "gh issue list", "silent_allow")
all_pass &= check("gh pr view silent", "gh pr view 42", "silent_allow")
all_pass &= check("gh repo view silent", "gh repo view owner/repo", "silent_allow")

# Non-gh command must not trigger gh checks
all_pass &= check("non-gh command", "echo 'gh pr comment'", "silent_allow")

# DENY: gh pr merge --admin bypasses all branch protections
all_pass &= check("gh pr merge --admin deny", "gh pr merge 42 --admin", "deny")
all_pass &= check("gh pr merge --admin with squash", "gh pr merge 42 --squash --admin", "deny")

# DENY: gh api to branch protection or ruleset endpoints
all_pass &= check("gh api rulesets deny", "gh api repos/owner/repo/rulesets -X PUT -f '{}'", "deny")
all_pass &= check("gh api protection deny", "gh api repos/owner/repo/branches/main/protection -X PUT", "deny")
all_pass &= check("gh api delete ruleset deny", "gh api repos/owner/repo/rulesets/123 --method DELETE", "deny")
all_pass &= check("gh api protection PATCH deny", "gh api -X PATCH repos/owner/repo/branches/main/protection", "deny")

# Safe gh api calls must NOT be blocked (no protection/ruleset endpoints)
all_pass &= check("gh api safe endpoint", "gh api repos/owner/repo/pulls", "silent_allow")
all_pass &= check("gh api issues safe", "gh api repos/owner/repo/issues", "silent_allow")

# DENY: gh pr merge with bypass-related flags
all_pass &= check("gh pr merge auto-merge with admin", "gh pr merge 42 --auto --admin", "deny")

# Regression: Safe GET calls to protection/ruleset endpoints must NOT be blocked
all_pass &= check("gh api rulesets GET safe", "gh api repos/owner/repo/rulesets", "silent_allow")
all_pass &= check("gh api protection GET safe", "gh api repos/owner/repo/branches/main/protection", "silent_allow")

# Regression: Safe gh api graphql queries mentioning rulesets must not be blocked
all_pass &= check("gh api graphql rulesets query safe", "gh api graphql --raw-field query='query { repository(name: \"repo\", owner: \"owner\") { rulesets(first: 10) { totalCount } } }'", "silent_allow")

# Regression: API calls with -f body containing "rulesets" in text must NOT be blocked
all_pass &= check("gh api comment with rulesets in body", "gh api repos/owner/repo/issues/42/comments -X POST -f body='See the rulesets docs for context'", "silent_allow")

print()
print("ALL TESTS PASSED" if all_pass else "SOME TESTS FAILED")
sys.exit(0 if all_pass else 1)
