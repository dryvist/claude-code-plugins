#!/usr/bin/env python3
"""Tests for secret-guard.py hook.

All sensitive inputs use FAKE values only: RFC2544 198.18/198.19 (allowed),
RFC1918 198 -> we use 10./192.168./172.16-31. SHAPES with octets that are NOT
any real homelab subnet, and example.invalid (allowed). No real value appears.

Verifies:
  - Structural RFC1918 IP shapes are denied.
  - Real-domain shapes are denied; example.invalid is allowed.
  - Fake RFC2544 198.18/198.19 IPs are allowed.
  - Clean content is allowed (silent).
  - Missing/empty keychain denylist fails OPEN (structural prong still runs).
  - A seeded TEST keychain literal denylist denies a planted fake token.
  - Edit/MultiEdit/NotebookEdit content fields are inspected.
  - Non-matching tools are silently allowed.

Run with: python3 content-guards/scripts/test_secret_guard.py
"""

import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).parent / "secret-guard.py"

# A guaranteed-absent keychain service so the literal prong is unavailable by
# default and the structural-only tests exercise the fail-open path.
ABSENT_SERVICE = "SENSITIVE_DENYLIST_NONEXISTENT_TEST_SERVICE_ZZZ"


def run(tool_input: dict, tool_name: str = "Write", env_extra=None) -> tuple[int, dict]:
    inp = json.dumps({"tool_name": tool_name, "tool_input": tool_input})
    env = dict(os.environ)
    # Default: point the literal prong at an absent service (fail-open) unless a
    # test overrides it.
    env.setdefault("SENSITIVE_DENYLIST_KEYCHAIN_SERVICE", ABSENT_SERVICE)
    if env_extra:
        env.update(env_extra)
    result = subprocess.run(
        ["python3", str(SCRIPT)],
        input=inp,
        capture_output=True,
        text=True,
        env=env,
    )
    output = json.loads(result.stdout.strip()) if result.stdout.strip() else {}
    return result.returncode, output


def decision(output: dict) -> str:
    if not output:
        return "silent_allow"
    return output["hookSpecificOutput"]["permissionDecision"]


def check(label: str, expected: str, tool_input: dict, tool_name="Write", env_extra=None) -> bool:
    _, output = run(tool_input, tool_name, env_extra)
    actual = decision(output)
    ok = actual == expected
    print(f"{'PASS' if ok else 'FAIL'} [{label}]: decision={actual}")
    if not ok:
        print(f"  Expected: {expected}, Got: {actual}")
        if output:
            # Confirm the matched VALUE is never echoed back.
            print(f"  reason={output['hookSpecificOutput']['permissionDecisionReason']}")
    return ok


all_pass = True

# --- Structural prong: RFC1918 IP shapes are denied -------------------------
all_pass &= check(
    "rfc1918 10.x denied",
    "deny",
    {"file_path": "x.tf", "content": 'ip = "10.20.30.40"'},
)
all_pass &= check(
    "rfc1918 192.168.x denied",
    "deny",
    {"file_path": "x.tf", "content": 'gateway = "192.168.5.1"'},
)
all_pass &= check(
    "rfc1918 172.16-31.x denied",
    "deny",
    {"file_path": "x.tf", "content": 'host = "172.20.1.1"'},
)

# --- Allowlist: fake RFC2544 198.18/198.19 IPs are allowed ------------------
all_pass &= check(
    "rfc2544 198.18 allowed",
    "silent_allow",
    {"file_path": "fixture.tf", "content": 'ip = "198.18.0.10"'},
)
all_pass &= check(
    "rfc2544 198.19 allowed",
    "silent_allow",
    {"file_path": "fixture.tf", "content": 'ip = "198.19.5.5"'},
)

# --- Structural domain prong is OFF by default (no false positives) ---------
all_pass &= check(
    "domain prong off by default allows github.com",
    "silent_allow",
    {"file_path": "x.md", "content": "see https://github.com/foo/bar for details"},
)

# --- Structural domain prong fires only when opted in via env var -----------
_DOMAIN_ON = {"SECRET_GUARD_DOMAIN_REGEX": r"\b[a-z0-9-]+\.(?:com|net|org)\b"}
all_pass &= check(
    "real domain shape denied when prong enabled",
    "deny",
    {"file_path": "x.md", "content": "see myhost.example.com for details"},
    env_extra=_DOMAIN_ON,
)
all_pass &= check(
    "example.invalid allowed even when domain prong enabled",
    "silent_allow",
    {"file_path": "x.md", "content": "see node.example.invalid for details"},
    env_extra=_DOMAIN_ON,
)

# --- Clean content is allowed -----------------------------------------------
all_pass &= check(
    "clean content allowed",
    "silent_allow",
    {"file_path": "x.py", "content": "def add(a, b):\n    return a + b\n"},
)

# --- Edit / MultiEdit / NotebookEdit fields are inspected -------------------
all_pass &= check(
    "Edit new_string denied",
    "deny",
    {"file_path": "x.tf", "old_string": "a", "new_string": 'ip = "10.1.2.3"'},
    tool_name="Edit",
)
all_pass &= check(
    "MultiEdit edits[].new_string denied",
    "deny",
    {"file_path": "x.tf", "edits": [{"old_string": "a", "new_string": 'ip = "192.168.9.9"'}]},
    tool_name="MultiEdit",
)
all_pass &= check(
    "NotebookEdit new_source denied",
    "deny",
    {"notebook_path": "x.ipynb", "new_source": 'host = "172.18.0.1"'},
    tool_name="NotebookEdit",
)
all_pass &= check(
    "Edit clean new_string allowed",
    "silent_allow",
    {"file_path": "x.tf", "old_string": "a", "new_string": "value = 42"},
    tool_name="Edit",
)

# --- Non-matching tool is silently allowed ----------------------------------
all_pass &= check(
    "non-matching tool allowed",
    "silent_allow",
    {"command": 'echo "10.1.2.3"'},
    tool_name="Bash",
)

# --- Fail-OPEN: absent keychain still allows clean + denies structural ------
# (the absent-service default already exercises this for every case above)
all_pass &= check(
    "fail-open absent keychain allows clean",
    "silent_allow",
    {"file_path": "x.py", "content": "print('hello world')"},
)

# --- Literal prong: seeded TEST keychain service denies a planted fake ------
# Seed a TEMPORARY fake entry in the auto-readable login keychain, point the
# hook at it, then delete it. If the keychain write prompts (non-interactive
# failure), skip this prong gracefully rather than block the suite.
TEST_SERVICE = "SENSITIVE_DENYLIST_TEST_SECRETGUARD"
# Fake denylist: a regex matching a clearly-fake planted token. NOT a real value.
FAKE_DENYLIST = "examplenode1\nexamplepool\nFAKE-PLANTED-TOKEN-[0-9]+\n"
user = os.environ.get("USER", "")
seeded = False
try:
    add = subprocess.run(
        ["security", "add-generic-password", "-a", user, "-s", TEST_SERVICE,
         "-w", FAKE_DENYLIST, "-U"],
        capture_output=True, text=True, timeout=10,
    )
    seeded = add.returncode == 0
except (OSError, subprocess.SubprocessError):
    seeded = False

if seeded:
    all_pass &= check(
        "literal denylist denies planted fake token",
        "deny",
        {"file_path": "x.tf", "content": "token = FAKE-PLANTED-TOKEN-42"},
        env_extra={"SENSITIVE_DENYLIST_KEYCHAIN_SERVICE": TEST_SERVICE},
    )
    all_pass &= check(
        "literal denylist denies fake node name",
        "deny",
        {"file_path": "x.tf", "content": "node = examplenode1"},
        env_extra={"SENSITIVE_DENYLIST_KEYCHAIN_SERVICE": TEST_SERVICE},
    )
    all_pass &= check(
        "literal denylist allows clean content",
        "silent_allow",
        {"file_path": "x.py", "content": "x = 1"},
        env_extra={"SENSITIVE_DENYLIST_KEYCHAIN_SERVICE": TEST_SERVICE},
    )
    # Clean up the temporary entry.
    subprocess.run(
        ["security", "delete-generic-password", "-a", user, "-s", TEST_SERVICE],
        capture_output=True, text=True, timeout=10,
    )
else:
    print("SKIP [literal denylist]: keychain seeding unavailable (non-interactive)")

print()
print("ALL TESTS PASSED" if all_pass else "SOME TESTS FAILED")
sys.exit(0 if all_pass else 1)
