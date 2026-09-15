#!/usr/bin/env python3
"""Test script for graphql guidance detection in git-permission-guard.py."""

import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).parent / "git-permission-guard.py"


def run(cmd: str) -> dict:
    inp = json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}})
    result = subprocess.run(
        ["python3", str(SCRIPT)],
        input=inp, capture_output=True, text=True
    )
    if result.stdout.strip():
        return json.loads(result.stdout.strip())
    return {}


def check(label: str, cmd: str, expected_decision: str, expected_fragments: list[str] | None = None):
    out = run(cmd)
    if not out:
        actual = "silent_allow"
        reason = ""
    else:
        actual = out["hookSpecificOutput"]["permissionDecision"]
        reason = out["hookSpecificOutput"]["permissionDecisionReason"]

    ok = actual == expected_decision
    if ok and expected_fragments:
        for frag in expected_fragments:
            if frag not in reason:
                ok = False
                print(f"FAIL [{label}]: missing '{frag}' in reason")
                print(f"  Reason: {reason[:400]}")
                break

    status = "PASS" if ok else "FAIL"
    print(f"{status} [{label}]: decision={actual}")
    if not ok and not expected_fragments:
        print(f"  Expected: {expected_decision}, Got: {actual}")
        print(f"  Reason: {reason[:300]}")
    return ok


all_pass = True

# 1: shell variable + wrong flag
all_pass &= check(
    "shell var + -f flag",
    "gh api graphql -f query='query { viewer { login $owner } }'",
    "allow",
    ["SHELL VARIABLE EXPANSION", "WRONG FLAG"],
)

# 2: wrong mutation addPullRequestReviewComment
all_pass &= check(
    "wrong mutation: addPullRequestReviewComment",
    "gh api graphql --raw-field query='mutation { addPullRequestReviewComment(input: {}) { id } }'",
    "allow",
    ["WRONG MUTATION NAME", "addPullRequestReviewThreadReply"],
)

# 3: wrong mutation resolvePullRequestReviewThread
all_pass &= check(
    "wrong mutation: resolvePullRequestReviewThread",
    "gh api graphql --raw-field query='mutation { resolvePullRequestReviewThread(input: {}) { thread { id } } }'",
    "allow",
    ["WRONG MUTATION NAME", "resolveReviewThread"],
)

# 4: correct mutation - silent allow
all_pass &= check(
    "correct mutation resolveReviewThread",
    'gh api graphql --raw-field query=\'mutation { resolveReviewThread(input: {threadId: "abc"}) { thread { id } } }\'',
    "silent_allow",
)

# 5: gh pr list - silent allow
all_pass &= check(
    "gh pr list unaffected",
    "gh pr list",
    "silent_allow",
)

# 6: combined - wrong flag + wrong mutation + shell var
all_pass &= check(
    "combined: -f flag + wrong mutation + shell var",
    "gh api graphql -f query='mutation { addPullRequestReviewComment(input: { body: \"$threadId\" }) { id } }'",
    "allow",
    ["SHELL VARIABLE EXPANSION", "WRONG MUTATION NAME", "WRONG FLAG"],
)

# 7: --jq false positive (no trigger)
all_pass &= check(
    "jq false positive check",
    "gh api graphql --raw-field query='{ viewer { login } }' --jq '.$var'",
    "silent_allow",
)

# 8: multi-line with trailing backslash
all_pass &= check(
    "multi-line trailing backslash",
    "gh api graphql --raw-field query='mutation { resolveReviewThread(input: {threadId: \"abc\"}) { thread { id isResolved } } }' \\",
    "allow",
    ["MULTI-LINE QUERY"],
)

# 9: addComment mutation - GraphQL equivalent of `gh pr comment` / the REST
# issues/{n}/comments POST, denied outright (not correctable - unlike
# WRONG_MUTATIONS, this mutation name is real and would succeed)
all_pass &= check(
    "addComment mutation deny",
    "gh api graphql --raw-field query='mutation { addComment(input: {subjectId: \"PR_kwABC\", body: \"hi\"}) { commentEdge { node { id } } } }'",
    "deny",
    ["top-level issue/PR comment", "resolve-pr-threads"],
)

# 10: addComment mutation with -f flag variant - still denied
all_pass &= check(
    "addComment mutation deny, -f flag",
    "gh api graphql -f query='mutation { addComment(input: {subjectId: \"PR_kwABC\", body: \"hi\"}) { commentEdge { node { id } } } }'",
    "deny",
)

# 11: addPullRequestReviewThreadReply (sanctioned) must stay unaffected
all_pass &= check(
    "addPullRequestReviewThreadReply unaffected",
    "gh api graphql --raw-field query='mutation { addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: \"abc\", body: \"hi\"}) { comment { id } } }'",
    "silent_allow",
)

print()
print("ALL TESTS PASSED" if all_pass else "SOME TESTS FAILED")
sys.exit(0 if all_pass else 1)
