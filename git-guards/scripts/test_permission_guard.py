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

# ---------------------------------------------------------------------------
# Git fixtures for BLOCKED_ON_MAIN branch-detection tests
# ---------------------------------------------------------------------------

_GITBASE = tempfile.mkdtemp(prefix="test_guard_git_")
atexit.register(shutil.rmtree, _GITBASE, ignore_errors=True)


def _git(*args, cwd):
    subprocess.run(["git"] + list(args), cwd=cwd, capture_output=True, check=True)


def _setup_git_fixture():
    base = Path(_GITBASE)
    bare = base / "repo.git"
    main_wt = base / "main"
    feat_wt = base / "feature" / "x"

    _git("init", "--bare", str(bare), cwd=_GITBASE)

    seed = base / "_seed"
    _git("clone", str(bare), str(seed), cwd=_GITBASE)
    _git("config", "user.email", "t@t.com", cwd=str(seed))
    _git("config", "user.name", "T", cwd=str(seed))
    (seed / "init.txt").write_text("init")
    _git("add", "init.txt", cwd=str(seed))
    _git("commit", "--no-gpg-sign", "-m", "init", cwd=str(seed))
    _git("push", "origin", "main", cwd=str(seed))
    _git("checkout", "-b", "feature/x", cwd=str(seed))
    _git("push", "origin", "feature/x", cwd=str(seed))
    shutil.rmtree(str(seed))

    main_wt.mkdir(parents=True)
    _git("worktree", "add", str(main_wt), "main", cwd=str(bare))
    _git("config", "user.email", "t@t.com", cwd=str(main_wt))
    _git("config", "user.name", "T", cwd=str(main_wt))

    feat_wt.parent.mkdir(parents=True)
    _git("worktree", "add", str(feat_wt), "feature/x", cwd=str(bare))

    return bare, main_wt, feat_wt


_BARE: Path = Path("/nonexistent")
_MAIN_WT: Path = Path("/nonexistent")
_FEAT_WT: Path = Path("/nonexistent")
_GIT_FIXTURE_OK = False
try:
    _BARE, _MAIN_WT, _FEAT_WT = _setup_git_fixture()
    _GIT_FIXTURE_OK = True
except Exception as exc:
    print(f"WARNING: git fixture setup failed: {exc}", file=sys.stderr)

# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------


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


def run_cwd(cmd: str, hook_cwd: str = "", proc_cwd: str = "") -> dict:
    """Run with an explicit hook cwd field and/or process cwd."""
    inp = json.dumps({
        "tool_name": "Bash",
        "tool_input": {"command": cmd},
        "cwd": hook_cwd,
    })
    result = subprocess.run(
        ["python3", str(SCRIPT)],
        input=inp,
        capture_output=True,
        text=True,
        cwd=proc_cwd or _TMPDIR,
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


def check_cwd(label: str, cmd: str, expected_decision: str,
              hook_cwd: str = "", proc_cwd: str = "") -> bool:
    out = run_cwd(cmd, hook_cwd=hook_cwd, proc_cwd=proc_cwd)
    actual = out["hookSpecificOutput"]["permissionDecision"] if out else "silent_allow"
    ok = actual == expected_decision
    print(f"{'PASS' if ok else 'FAIL'} [{label}]: decision={actual}")
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

# DENY: --no-gpg-sign on commit (required_signatures rejects unsigned)
all_pass &= check("git commit --no-gpg-sign", "git commit -m msg --no-gpg-sign", "deny")

# DENY: --no-gpg-sign on tag
all_pass &= check("git tag --no-gpg-sign", "git tag --no-gpg-sign v1.0", "deny")

# DENY: -c commit.gpgsign=false bypasses signing for one invocation
all_pass &= check("git -c commit.gpgsign=false commit", "git -c commit.gpgsign=false commit -m msg", "deny")

# DENY: -c commit.gpgsign=0 (numeric false form)
all_pass &= check("git -c commit.gpgsign=0 commit", "git -c commit.gpgsign=0 commit -m msg", "deny")

# DENY: -c tag.gpgsign=false bypasses tag signing
all_pass &= check("git -c tag.gpgsign=false tag", "git -c tag.gpgsign=false tag v1.0", "deny")

# DENY: git config commit.gpgsign false persists the bypass
all_pass &= check("git config commit.gpgsign false", "git config commit.gpgsign false", "deny")

# DENY: git config --global tag.gpgsign false
all_pass &= check("git config --global tag.gpgsign false", "git config --global tag.gpgsign false", "deny")

# DENY: git config --unset commit.gpgsign reverts to default-off
all_pass &= check("git config --unset commit.gpgsign", "git config --unset commit.gpgsign", "deny")

# ALLOW: -c commit.gpgsign=true forces signing for one invocation (legitimate)
all_pass &= check("git -c commit.gpgsign=true commit", "git -c commit.gpgsign=true commit -m msg", "silent_allow")

# ALLOW: -c commit.gpgsign with no value (git treats missing value as true)
all_pass &= check("git -c commit.gpgsign commit", "git -c commit.gpgsign commit -m msg", "silent_allow")

# ALLOW: enabling signing in config
all_pass &= check("git config commit.gpgsign true", "git config commit.gpgsign true", "silent_allow")

# ALLOW: reading signing config
all_pass &= check("git config --get commit.gpgsign", "git config --get commit.gpgsign", "silent_allow")

# ALLOW: listing signing config
all_pass &= check("git config --list commit.gpgsign", "git config --list", "silent_allow")

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

# ---------------------------------------------------------------------------
# BLOCKED_ON_MAIN: worktree + bare-repo branch-detection tests
# ---------------------------------------------------------------------------

if _GIT_FIXTURE_OK:
    # 1. git commit from main worktree (no -C) → deny
    all_pass &= check_cwd(
        "commit from main-wt denied",
        "git commit -m msg",
        "deny",
        hook_cwd=str(_MAIN_WT),
    )

    # 2. git add from main worktree (no -C) → deny
    all_pass &= check_cwd(
        "add from main-wt denied",
        "git add file.txt",
        "deny",
        hook_cwd=str(_MAIN_WT),
    )

    # 3. git commit from feature worktree (no -C) → silent_allow
    all_pass &= check_cwd(
        "commit from feature-wt allowed",
        "git commit -m msg",
        "silent_allow",
        hook_cwd=str(_FEAT_WT),
    )

    # 4. git -C <feature-wt> commit from main-wt CWD → silent_allow (regression: -C bug)
    all_pass &= check_cwd(
        "-C feature-wt from main-wt CWD allowed",
        f"git -C {_FEAT_WT} commit -m msg",
        "silent_allow",
        hook_cwd=str(_MAIN_WT),
    )

    # 5. git -C <feature-wt> add from main-wt CWD → silent_allow
    all_pass &= check_cwd(
        "-C feature-wt add from main-wt CWD allowed",
        f"git -C {_FEAT_WT} add file.txt",
        "silent_allow",
        hook_cwd=str(_MAIN_WT),
    )

    # 6. git -C <main-wt> commit from feature-wt CWD → deny (-C redirects to main)
    all_pass &= check_cwd(
        "-C main-wt from feature-wt CWD denied",
        f"git -C {_MAIN_WT} commit -m msg",
        "deny",
        hook_cwd=str(_FEAT_WT),
    )

    # 7. git commit from bare repo dir → silent_allow (bare repo, not a work tree)
    all_pass &= check_cwd(
        "commit from bare-repo dir allowed",
        "git commit -m msg",
        "silent_allow",
        hook_cwd=str(_BARE),
    )

    # 8. Relative -C ../feature/x resolved against hook_cwd → silent_allow
    all_pass &= check_cwd(
        "relative -C feature-wt allowed",
        "git -C ../feature/x commit -m msg",
        "silent_allow",
        hook_cwd=str(_MAIN_WT),
    )
else:
    print("SKIP: git fixture unavailable, skipping BLOCKED_ON_MAIN worktree tests")

print()
print("ALL TESTS PASSED" if all_pass else "SOME TESTS FAILED")
sys.exit(0 if all_pass else 1)
