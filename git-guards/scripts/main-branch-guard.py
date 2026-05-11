#!/usr/bin/env python3
"""
main-branch-guard.py - PreToolUse hook to prevent Edit/Write/NotebookEdit on main branch.

Blocks file editing operations when the file is in a git repository on the main branch.
Ignores files outside git repositories (like ~/.claude/plans/).

Exit codes: 0=allow (JSON on stdout), 0=deny (JSON on stdout with permissionDecision=deny)
"""

import fnmatch
import json
import subprocess
import sys
from pathlib import Path


def deny(reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


def is_in_git_worktree(file_path: str) -> bool:
    """Check if the file's directory is inside a git work tree.

    `git rev-parse --is-inside-work-tree` exits 0 even for directories
    adjacent to a bare repo — it prints "false" but the exit status is still
    0 — so we must inspect the output, not just the exit code. Returns False
    for bare-repo siblings, scratch dirs, and any path outside a work tree.
    """
    path = Path(file_path)
    file_dir = str(path.parent)
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            cwd=file_dir,
            capture_output=True,
            text=True,
        )
        return result.returncode == 0 and result.stdout.strip() == "true"
    except (OSError, subprocess.SubprocessError):
        return False



def get_current_branch(file_path: str) -> str:
    """Get the current git branch from the file's directory."""
    path = Path(file_path)
    file_dir = str(path.parent)
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=file_dir,
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return ""


def is_gitignored(file_path: str) -> bool:
    """Run `git check-ignore` from the file's directory.

    Pass only the basename and set cwd to the parent so the lookup is correct
    regardless of whether the input was absolute or relative. Exit 0 = ignored;
    anything else (1, 128, OSError) is treated as not ignored.
    """
    path = Path(file_path)
    try:
        result = subprocess.run(
            ["git", "check-ignore", "-q", "--", path.name],
            cwd=str(path.parent),
            capture_output=True,
        )
        return result.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def is_tracked(file_path: str) -> bool:
    """Return True if `file_path` is tracked in the index.

    Uses `git ls-files --error-unmatch`: exit 0 = tracked, 1 = not tracked.
    Same cwd-and-basename trick as `is_gitignored` for path-safety.
    """
    path = Path(file_path)
    try:
        result = subprocess.run(
            ["git", "ls-files", "--error-unmatch", "--", path.name],
            cwd=str(path.parent),
            capture_output=True,
        )
        return result.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def is_local_exempt(file_path: str) -> bool:
    """Local-only files are editable on main; tracked files are not.

    - `*.local.*` (e.g. `settings.local.json`) — local override convention,
      allowed unless the file slipped into the index, in which case the worktree
      workflow re-applies.
    - gitignored dotfiles (e.g. `.env`, `.env.local`) — machine-specific config.
      Tracked dotfiles like `.gitignore` and `.envrc` are not gitignored, so they
      stay blocked.
    """
    basename = Path(file_path).name
    if fnmatch.fnmatch(basename, "*.local.*"):
        return not is_tracked(file_path)
    if basename.startswith("."):
        return is_gitignored(file_path)
    return False


def main() -> None:
    try:
        hook_input = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)

    tool_name = hook_input.get("tool_name", "")
    if tool_name not in ("Edit", "Write", "NotebookEdit"):
        sys.exit(0)

    tool_input = hook_input.get("tool_input", {})
    file_path = tool_input.get("file_path") or tool_input.get("notebook_path", "")
    if not file_path:
        sys.exit(0)

    if is_local_exempt(file_path):
        sys.exit(0)

    if not is_in_git_worktree(file_path):
        sys.exit(0)

    current_branch = get_current_branch(file_path)
    if current_branch == "main":
        deny(
            f"BLOCKED: File '{file_path}' is in the main worktree. "
            "Editing files in the main worktree is not allowed.\n\n"
            "Create a worktree using `/superpowers:using-git-worktrees`.",
        )

    sys.exit(0)


if __name__ == "__main__":
    main()
