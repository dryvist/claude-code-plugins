#!/usr/bin/env python3
"""Tests for main-branch-guard hook."""

import json
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

HOOK = Path(__file__).parent / "main-branch-guard.py"


def run_hook(tool_name: str, tool_input: dict) -> dict | None:
    """Run hook and return parsed output, or None if no output."""
    result = subprocess.run(
        [sys.executable, str(HOOK)],
        input=json.dumps({"tool_name": tool_name, "tool_input": tool_input}),
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout) if result.stdout.strip() else None


@contextmanager
def setup_test_repo():
    """Create a temporary git repo with main worktree structure."""
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_root = Path(tmpdir)
        main_worktree = repo_root / "main"
        main_worktree.mkdir()

        # Initialize git repo on main branch explicitly (default branch varies by system)
        subprocess.run(
            ["git", "init", "-b", "main"], cwd=main_worktree, capture_output=True, check=True
        )
        subprocess.run(
            ["git", "config", "user.email", "test@example.com"],
            cwd=main_worktree,
            capture_output=True,
            check=True,
        )
        subprocess.run(
            ["git", "config", "user.name", "Test User"],
            cwd=main_worktree,
            capture_output=True,
            check=True,
        )

        # Create initial commit
        test_file = main_worktree / "test.txt"
        test_file.write_text("test")
        subprocess.run(
            ["git", "add", "test.txt"], cwd=main_worktree, capture_output=True, check=True
        )
        subprocess.run(
            ["git", "commit", "-m", "Initial commit"],
            cwd=main_worktree,
            capture_output=True,
            check=True,
        )

        yield main_worktree


def test_deny_in_main_worktree():
    """Test that editing files in main worktree is denied."""
    with setup_test_repo() as main_worktree:
        test_file = main_worktree / "README.md"
        test_file.write_text("# Test")

        output = run_hook("Edit", {"file_path": str(test_file)})
        actual = output["hookSpecificOutput"]["permissionDecision"] if output else None

        assert actual == "deny", f"Expected deny in main worktree, got {actual!r}"
        print("✅ Deny in main worktree: deny")


def test_deny_on_main_branch():
    """Test that editing files on main branch is denied."""
    with setup_test_repo() as main_worktree:
        # Ensure we're on main branch
        subprocess.run(
            ["git", "checkout", "-b", "main"],
            cwd=main_worktree,
            capture_output=True,
            check=False,
        )

        test_file = main_worktree / "test.txt"
        output = run_hook("Write", {"file_path": str(test_file)})
        actual = output["hookSpecificOutput"]["permissionDecision"] if output else None

        assert actual == "deny", f"Expected deny when branch is main, got {actual!r}"
        print("✅ Deny when branch is main: deny")


def test_allow_for_non_main():
    """Test that editing files in non-main worktree/branch is allowed."""
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_root = Path(tmpdir)
        feat_worktree = repo_root / "feat" / "test-feature"
        feat_worktree.mkdir(parents=True)

        # Initialize git repo on a feature branch
        subprocess.run(
            ["git", "init"], cwd=feat_worktree, capture_output=True, check=True
        )
        subprocess.run(
            ["git", "config", "user.email", "test@example.com"],
            cwd=feat_worktree,
            capture_output=True,
            check=True,
        )
        subprocess.run(
            ["git", "config", "user.name", "Test User"],
            cwd=feat_worktree,
            capture_output=True,
            check=True,
        )
        subprocess.run(
            ["git", "checkout", "-b", "feature/test-feature"],
            cwd=feat_worktree,
            capture_output=True,
            check=True,
        )

        # Create initial commit
        test_file = feat_worktree / "test.txt"
        test_file.write_text("test")
        subprocess.run(
            ["git", "add", "test.txt"], cwd=feat_worktree, capture_output=True, check=True
        )
        subprocess.run(
            ["git", "commit", "-m", "Initial commit"],
            cwd=feat_worktree,
            capture_output=True,
            check=True,
        )

        output = run_hook("Edit", {"file_path": str(test_file)})
        actual = output["hookSpecificOutput"]["permissionDecision"] if output else None

        assert actual is None, f"Expected allow for non-main, got {actual!r}"
        print("✅ Allow for non-main: None")


def test_allow_non_edit_tools():
    """Test that non-Edit/Write/NotebookEdit tools are allowed."""
    output = run_hook("Read", {"file_path": "/tmp/test.txt"})
    actual = output["hookSpecificOutput"]["permissionDecision"] if output else None

    assert actual is None, f"Expected allow for non-edit tools, got {actual!r}"
    print("✅ Ignore other tools: None")


def test_allow_file_outside_git_repo():
    """Test that editing a file outside any git repository is allowed."""
    with tempfile.TemporaryDirectory() as tmpdir:
        outside = Path(tmpdir) / "scratch.txt"
        outside.write_text("data")

        output = run_hook("Edit", {"file_path": str(outside)})
        actual = output["hookSpecificOutput"]["permissionDecision"] if output else None

        assert actual is None, f"Expected allow for file outside git, got {actual!r}"
        print("✅ Allow file outside git repo: None")


def test_allow_empty_input():
    """Test that empty/missing tool_input is allowed (fail-open)."""
    output = run_hook("Edit", {})
    actual = output["hookSpecificOutput"]["permissionDecision"] if output else None

    assert actual is None, f"Expected allow for empty input, got {actual!r}"
    print("✅ Allow empty input: None")


def test_allow_bare_repo_sibling():
    """Regression: scratch dirs sibling to a bare-repo + main worktree must be allowed.

    Layout:
        repo_root/        ← bare repo (.git here, HEAD on 'main')
        repo_root/main/   ← main worktree (BLOCKED — correct)
        repo_root/scratch/ ← non-worktree scratch dir (must be ALLOWED)

    Before the fix, `git branch --show-current` from `scratch/` walked up to
    the bare repo and reported `main`, which falsely triggered the deny path.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_root = Path(tmpdir)
        bare = repo_root / ".git"

        subprocess.run(
            ["git", "init", "--bare", "--initial-branch=main", str(bare)],
            capture_output=True,
            check=True,
        )

        # Create main worktree from the bare repo
        main_worktree = repo_root / "main"
        # First seed a commit so worktree creation has a HEAD
        seed = repo_root / "_seed"
        seed.mkdir()
        subprocess.run(
            ["git", "init", "--initial-branch=main", str(seed)],
            capture_output=True,
            check=True,
        )
        subprocess.run(
            ["git", "config", "user.email", "t@e.com"],
            cwd=seed,
            capture_output=True,
            check=True,
        )
        subprocess.run(
            ["git", "config", "user.name", "T"],
            cwd=seed,
            capture_output=True,
            check=True,
        )
        (seed / "x").write_text("x")
        subprocess.run(
            ["git", "add", "x"],
            cwd=seed,
            capture_output=True,
            check=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "seed"],
            cwd=seed,
            capture_output=True,
            check=True,
        )
        subprocess.run(
            ["git", "push", str(bare), "main"],
            cwd=seed,
            capture_output=True,
            check=True,
        )
        subprocess.run(
            ["git", "--git-dir", str(bare), "worktree", "add", str(main_worktree), "main"],
            capture_output=True,
            check=True,
        )

        # Scratch dir at repo_root/scratch (sibling of main/, NOT a worktree)
        scratch = repo_root / "scratch"
        scratch.mkdir()
        scratch_file = scratch / "snapshot.md"

        output = run_hook("Write", {"file_path": str(scratch_file)})
        actual = output["hookSpecificOutput"]["permissionDecision"] if output else None

        assert actual is None, f"Allow bare-repo sibling regression: expected None, got {actual!r}"
        print("✅ Allow bare-repo sibling: None")


def test_notebook_edit():
    """Test that NotebookEdit is also guarded."""
    with setup_test_repo() as main_worktree:
        notebook = main_worktree / "test.ipynb"
        notebook.write_text('{"cells": []}')

        output = run_hook("NotebookEdit", {"notebook_path": str(notebook)})
        actual = output["hookSpecificOutput"]["permissionDecision"] if output else None

        assert actual == "deny", f"Expected deny for NotebookEdit in main, got {actual!r}"
        print("✅ Deny NotebookEdit in main: deny")


def test_allow_local_pattern_in_main():
    """Files matching *.local.* are always allowed, even in main worktree."""
    with setup_test_repo() as main_worktree:
        local_file = main_worktree / "settings.local.json"

        output = run_hook("Write", {"file_path": str(local_file)})
        actual = output["hookSpecificOutput"]["permissionDecision"] if output else None

        assert actual is None, f"Expected allow for *.local.* in main, got {actual!r}"
        print("✅ Allow *.local.* in main: None")


def test_allow_gitignored_env_in_main():
    """Gitignored dotfiles (e.g. .env) are allowed in main worktree."""
    with setup_test_repo() as main_worktree:
        gitignore = main_worktree / ".gitignore"
        gitignore.write_text(".env\n")
        subprocess.run(
            ["git", "add", ".gitignore"],
            cwd=main_worktree,
            capture_output=True,
            check=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "ignore .env"],
            cwd=main_worktree,
            capture_output=True,
            check=True,
        )

        env_file = main_worktree / ".env"
        output = run_hook("Write", {"file_path": str(env_file)})
        actual = output["hookSpecificOutput"]["permissionDecision"] if output else None

        assert actual is None, f"Expected allow for gitignored .env in main, got {actual!r}"
        print("✅ Allow gitignored .env in main: None")


def test_deny_tracked_dotfile_in_main():
    """Tracked dotfiles (e.g. .gitignore itself) are still denied in main worktree."""
    with setup_test_repo() as main_worktree:
        gitignore = main_worktree / ".gitignore"
        gitignore.write_text("*.pyc\n")
        subprocess.run(
            ["git", "add", ".gitignore"],
            cwd=main_worktree,
            capture_output=True,
            check=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "add gitignore"],
            cwd=main_worktree,
            capture_output=True,
            check=True,
        )

        output = run_hook("Edit", {"file_path": str(gitignore)})
        actual = output["hookSpecificOutput"]["permissionDecision"] if output else None

        assert actual == "deny", f"Expected deny for tracked .gitignore in main, got {actual!r}"
        print("✅ Deny tracked .gitignore in main: deny")


def test_deny_tracked_local_pattern_in_main():
    """Regression for review feedback: `*.local.*` files that slipped into the
    index must not bypass the guard — once tracked, they belong to a feature
    branch like everything else."""
    with setup_test_repo() as main_worktree:
        local_file = main_worktree / "settings.local.json"
        local_file.write_text("{}")
        subprocess.run(
            ["git", "add", "settings.local.json"],
            cwd=main_worktree,
            capture_output=True,
            check=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "add tracked local file"],
            cwd=main_worktree,
            capture_output=True,
            check=True,
        )

        output = run_hook("Edit", {"file_path": str(local_file)})
        actual = output["hookSpecificOutput"]["permissionDecision"] if output else None

        assert actual == "deny", f"Expected deny for tracked *.local.* in main, got {actual!r}"
        print("✅ Deny tracked *.local.* in main: deny")


def main():
    """Run all tests."""
    test_deny_in_main_worktree()
    test_deny_on_main_branch()
    test_allow_for_non_main()
    test_allow_non_edit_tools()
    test_allow_file_outside_git_repo()
    test_allow_empty_input()
    test_notebook_edit()
    test_allow_bare_repo_sibling()
    test_allow_local_pattern_in_main()
    test_allow_gitignored_env_in_main()
    test_deny_tracked_dotfile_in_main()
    test_deny_tracked_local_pattern_in_main()


if __name__ == "__main__":
    main()
