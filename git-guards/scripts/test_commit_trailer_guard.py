#!/usr/bin/env python3
"""Tests for commit-trailer-guard.py."""

import atexit
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).parent / "commit-trailer-guard.py"

_TMPDIR = tempfile.mkdtemp(prefix="test_trailer_")
atexit.register(shutil.rmtree, _TMPDIR, ignore_errors=True)

MODEL = "claude-opus-4-7"
OLD_TRAILER = "Assisted-by: Claude <noreply@anthropic.com>"
NEW_TRAILER = f"Assisted-by: Claude:{MODEL}"


def _make_transcript(model: str = MODEL) -> str:
    """Write a minimal jsonl transcript and return its path."""
    path = Path(_TMPDIR) / f"transcript_{model.replace(':', '_')}.jsonl"
    path.write_text(json.dumps({"message": {"model": model}}) + "\n")
    return str(path)


def run(command: str, transcript_path: str = "") -> dict:
    inp = json.dumps({
        "tool_name": "Bash",
        "tool_input": {"command": command},
        "transcript_path": transcript_path,
    })
    result = subprocess.run(
        ["python3", str(SCRIPT)],
        input=inp,
        capture_output=True,
        text=True,
    )
    if result.stdout.strip():
        return json.loads(result.stdout.strip())
    return {}


def check(label: str, command: str, expected_decision: str,
          transcript_path: str = "", expected_new_command: str = "") -> bool:
    out = run(command, transcript_path)
    actual_decision = out["hookSpecificOutput"]["permissionDecision"] if out else "silent_allow"
    ok = actual_decision == expected_decision
    if ok and expected_new_command:
        actual_cmd = out.get("updatedInput", {}).get("command", "")
        ok = actual_cmd == expected_new_command
        if not ok:
            print(f"FAIL [{label}]: command mismatch")
            print(f"  Expected: {expected_new_command!r}")
            print(f"  Got:      {actual_cmd!r}")
            return False
    print(f"{'PASS' if ok else 'FAIL'} [{label}]: decision={actual_decision}")
    if not ok:
        print(f"  Expected decision: {expected_decision}, Got: {actual_decision}")
    return ok


all_pass = True
transcript = _make_transcript()

# 1. Standard -m form: trailer rewritten
cmd1 = f'git commit -m "fix: x\n\n{OLD_TRAILER}"'
all_pass &= check(
    "standard -m rewrite",
    cmd1,
    "allow",
    transcript_path=transcript,
    expected_new_command=cmd1.replace(OLD_TRAILER, NEW_TRAILER),
)

# 2. Heredoc form: trailer rewritten, rest of command preserved verbatim
heredoc_cmd = (
    'git commit -m "$(cat <<\'EOF\'\n'
    'fix: something\n\n'
    f'{OLD_TRAILER}\n'
    'EOF\n)"'
)
all_pass &= check(
    "heredoc form rewrite",
    heredoc_cmd,
    "allow",
    transcript_path=transcript,
    expected_new_command=heredoc_cmd.replace(OLD_TRAILER, NEW_TRAILER),
)

# 3. git -C /worktree commit with trailer → rewritten
cmd3 = f'git -C /some/worktree commit -m "test\n\n{OLD_TRAILER}"'
all_pass &= check(
    "git -C commit rewrite",
    cmd3,
    "allow",
    transcript_path=transcript,
    expected_new_command=cmd3.replace(OLD_TRAILER, NEW_TRAILER),
)

# 4. git status with trailer string in an arg → no rewrite (not a commit)
all_pass &= check(
    "non-commit subcommand no rewrite",
    f'git status --short "{OLD_TRAILER}"',
    "silent_allow",
    transcript_path=transcript,
)

# 5. git commit without trailer → silent allow
all_pass &= check(
    "no trailer silent allow",
    'git commit -m "feat: no trailer"',
    "silent_allow",
    transcript_path=transcript,
)

# 6. git commit with trailer but missing transcript → silent allow (fail-open)
all_pass &= check(
    "missing transcript fail-open",
    f'git commit -m "fix\n\n{OLD_TRAILER}"',
    "silent_allow",
    transcript_path="",
)

# 7. Already-correct trailer → silent allow (no change needed)
cmd7 = f'git commit -m "fix\n\n{NEW_TRAILER}"'
all_pass &= check(
    "already-correct trailer no-op",
    cmd7,
    "silent_allow",
    transcript_path=transcript,
)

print()
print("ALL TESTS PASSED" if all_pass else "SOME TESTS FAILED")
sys.exit(0 if all_pass else 1)
