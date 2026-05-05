#!/usr/bin/env python3
"""Tests for git-permission-guard.py ASK/DENY decisions."""

import atexit
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).parent / "git-permission-guard.py"

# Run tests from a non-git temp dir so _is_on_main_branch() fails open (returns False),
# preventing BLOCKED_ON_MAIN from intercepting tests that expect ask/silent_allow.
_TMPDIR = tempfile.mkdtemp(prefix="test_guard_")
atexit.register(shutil.rmtree, _TMPDIR, ignore_errors=True)


def run(cmd: str) -> dict:
    inp = json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}})
    result = subprocess.run(
        ["python3", str(SCRIPT)],
        input=inp,
        capture_output=True,
        text=True,
        cwd=_TMPDIR,
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

# git rm (plain) - silent allow: git protects uncommitted changes by default
all_pass &= check("git rm plain", "git rm some/file.txt", "silent_allow")

# git rm --cached - silent allow: only removes from index, working tree untouched
all_pass &= check("git rm --cached", "git rm --cached some/file.txt", "silent_allow")

# git rm -f - must ask: permanently discards uncommitted changes
all_pass &= check("git rm -f", "git rm -f some/file.txt", "ask")

# git rm --force - must ask: permanently discards uncommitted changes
all_pass &= check("git rm --force", "git rm --force some/file.txt", "ask")

# git rm -r - must ask: recursive deletion
all_pass &= check("git rm -r", "git rm -r some/directory/", "ask")

# git rm -rf - must ask: combined short flags, force-removes recursively
all_pass &= check("git rm -rf", "git rm -rf some/directory/", "ask")

# git rm -r -f - must ask: matches -r first (more specific would need ordering)
all_pass &= check("git rm -r -f", "git rm -r -f some/directory/", "ask")

# git restore - must ask: discards local changes
all_pass &= check("git restore", "git restore some/file.txt", "ask")

# git clean - must ask: removes untracked files
all_pass &= check("git clean", "git clean -fd", "ask")

# git reset - must ask: can lose uncommitted work
all_pass &= check("git reset", "git reset --hard HEAD", "ask")

# git push --force origin main - must DENY (DENY_GIT_ONLY: any force-push is denied)
all_pass &= check("git push --force origin main", "git push --force origin main", "deny")

# git push --force to any branch is now denied (DENY_GIT_ONLY, tightened policy)
all_pass &= check("git push --force feature branch", "git push --force origin feature/my-branch", "deny")

# git global option before push must still deny (--no-pager is stripped by extraction loop)
all_pass &= check("git --no-pager push --force feature branch", "git --no-pager push --force origin feature/my-branch", "deny")

# DENY: commit --no-verify
all_pass &= check("git commit --no-verify", "git commit -m msg --no-verify", "deny")

# DENY: commit -n (short form of --no-verify)
all_pass &= check("git commit -n deny", "git commit -n -m msg", "deny")

# DENY: commit -an (combined short flags including -n)
all_pass &= check("git commit -an deny", "git commit -an -m msg", "deny")

# ALLOW (ask): commit --amend --no-edit must not be blocked (regression: issue #180)
all_pass &= check("git commit --amend --no-edit allow", "git commit --amend --no-edit", "ask")

# DENY: remove hooks
all_pass &= check("rm .git/hooks", "rm .git/hooks/pre-commit", "deny")

# DENY: --no-gpg-sign disables commit signing (required_signatures rejects unsigned)
all_pass &= check("git commit --no-gpg-sign", "git commit -m msg --no-gpg-sign", "deny")

# DENY: -c commit.gpgsign=false bypasses signing for one invocation
all_pass &= check("git -c commit.gpgsign=false commit", "git -c commit.gpgsign=false commit -m msg", "deny")

# DENY: -c tag.gpgsign=false bypasses tag signing
all_pass &= check("git -c tag.gpgsign=false tag", "git -c tag.gpgsign=false tag v1.0", "deny")

# DENY: git config commit.gpgsign false persists the bypass
all_pass &= check("git config commit.gpgsign false", "git config commit.gpgsign false", "deny")

# DENY: git config --global tag.gpgsign false
all_pass &= check("git config --global tag.gpgsign false", "git config --global tag.gpgsign false", "deny")

# False positive guard: commit message containing 'commit.gpgsign' must not deny
all_pass &= check("commit.gpgsign in message", 'git -c user.name=test tag v99-test -m "allow commit.gpgsign bypass example"', "silent_allow")

# Non-git command: silent allow
all_pass &= check("ls command", "ls -la", "silent_allow")

# git -C <path> tests: subcommand extracted correctly before DENY/ASK checks
all_pass &= check("git -C rm plain", "git -C ~/git/.github/main rm .github/workflows/file.yml", "silent_allow")
all_pass &= check("git -C commit --no-verify", 'git -C /some/path commit -m "msg" --no-verify', "deny")
all_pass &= check("git -C reset --hard", "git -C /some/path reset --hard HEAD", "ask")
all_pass &= check("git -C -c core.hooksPath deny", "git -C /some/path -c core.hooksPath=/dev/null commit -m test", "deny")
all_pass &= check("git -C restore ask", "git -C /some/path restore file.txt", "ask")

# core.hooksPath precision: value containing the substring must not trigger deny (uses fetch, not commit)
all_pass &= check("hooksPath in value only", "git -c some.key=echo-core.hooksPath fetch origin", "silent_allow")

# Loop strips --no-pager, then extracts -c core.hooksPath directly → deny via git_config_opts path
all_pass &= check("--no-pager before -c hooksPath", "git --no-pager -c core.hooksPath=/dev/null commit -m msg", "deny")
# Loop strips --bare, extracts both -c options → second -c core.hooksPath triggers deny via git_config_opts path
all_pass &= check("valid -c then --bare then -c hooksPath", "git -c user.name=test --bare -c core.hooksPath=/dev/null commit -m msg", "deny")
# False positive guard: tag message containing the bypass pattern as a substring must not deny
# Uses 'git tag' (not in BLOCKED_ON_MAIN) to test the tokenizer false-positive scenario on any branch
all_pass &= check("hooksPath in tag message", 'git -c user.name=test tag v99-test -m "allow -c core.hooksPath bypass example"', "silent_allow")

print()
print("ALL TESTS PASSED" if all_pass else "SOME TESTS FAILED")
sys.exit(0 if all_pass else 1)
