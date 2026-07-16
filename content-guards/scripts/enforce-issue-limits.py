#!/usr/bin/env python3
"""
Claude Code PreToolUse hook for GitHub issue and PR backlog limits.

Blocks `gh issue create` and `gh pr create` when limits are exceeded, and
detects duplicate titles against currently-open items.

Hard limits (per-repo, OPEN items only):
  - 100 open issues
  - 15 open PRs

NO "ai-created" LABEL LIMIT — removed deliberately. Nothing ever applied the
label: zero issues and zero PRs carried it in any state, so the check scanned
labels on every create only to compare 0 against 25. A limit on a label nobody
applies is not a safety net, it is a per-call cost that always passes.

NO 24h RATE LIMIT — removed deliberately, do not reintroduce.

It counted items *created* in a rolling window regardless of whether they were
reviewed, merged, and closed minutes later. That measures throughput, not mess:
a productive day of 50 merged PRs hit the identical wall as 50 abandoned ones.
The only real signal it carried — "too much is open right now" — is already
measured, and measured correctly, by the hard limits above, which count what is
still open. It also had no useful escape: its own message suggested raising
GH_ACTION_LIMIT_PR, i.e. it told you to disable the check that caught you, which
is not a guard, it is a speed bump with a documented bypass.

If you want to constrain backlog, add or lower a hard limit on OPEN items.

Exit codes:
  0 = allow the command
  2 = block the command (shows stderr to Claude)

Input: JSON from stdin with tool_input.command containing the Bash command
"""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys

# Max OPEN items per resource type. This is the only backlog signal worth
# blocking on: it counts what is still outstanding right now.
HARD_LIMITS = {"issue": 100, "pr": 15}

_CMD_RE = re.compile(r"(?:^|\s)gh\s+(issue|pr)\s+(create|edit)(?:\s|$)")

_GH_ERRORS = (
    OSError,
    subprocess.TimeoutExpired,
    subprocess.SubprocessError,
    json.JSONDecodeError,
    ValueError,
)


def _extract_repo_dir(command: str) -> str | None:
    """Extract target repo directory from cd prefix in bash commands."""
    m = re.match(r'^\s*cd\s+("(?:[^"]+)"|\'(?:[^\']+)\'|[^\s;&]+)', command)
    if m:
        path = m.group(1).strip("'\"")
        path = os.path.abspath(os.path.expanduser(path))
        if not os.path.isdir(path):
            return None
        return path
    return None


def _gh_json(args: list[str], cwd: str | None = None) -> list[dict]:
    """Run a gh command that returns JSON, fail-open on any error."""
    try:
        result = subprocess.run(
            ["gh", *args],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
            cwd=cwd,
        )
        return json.loads(result.stdout)
    except _GH_ERRORS as e:
        print(
            f"Warning: gh command failed: {e}. Allowing command to proceed.",
            file=sys.stderr,
        )
        return []


def _count_open(resource: str, cwd: str | None = None) -> int:
    """Count open items for a resource type."""
    items = _gh_json([
        resource, "list", "--state", "open",
        "--json", "number", "--limit", "100",
    ], cwd=cwd)
    return len(items)


def _normalize_title(title: str) -> list[str]:
    """Strip conventional-commit prefix and return first 4 lowercase words."""
    cleaned = re.sub(r"^[a-z]+(\([^)]*\))?:\s*", "", title.strip().lower())
    return cleaned.split()[:4]


def _check_duplicate(resource: str, label: str, command: str, cwd: str | None = None) -> None:
    """Block if an open item has a similar title to the one being created."""
    try:
        tokens = shlex.split(command)
    except ValueError:
        return
    # Extract --title value
    title = None
    for i, token in enumerate(tokens):
        if token == "--title" and i + 1 < len(tokens):
            title = tokens[i + 1]
            break
        if token.startswith("--title="):
            title = token[len("--title="):]
            break
    if not title:
        return

    proposed = _normalize_title(title)
    if len(proposed) < 2:
        return

    items = _gh_json([
        resource, "list", "--state", "open",
        "--json", "title,number", "--limit", "100",
    ], cwd=cwd)
    for item in items:
        existing_title = item.get("title", "")
        existing_words = _normalize_title(existing_title)
        if len(existing_words) >= 2 and proposed == existing_words:
            _block(
                f"Duplicate {label} detected",
                f"Your title matches existing #{item['number']}: {existing_title!r}\n\n"
                f"Ask the user before creating a duplicate {label}.",
            )


def _block(reason: str, details: str) -> None:
    """Print block message and exit with code 2."""
    indented = "\n".join(f"  {line}" if line else "" for line in details.splitlines())
    print(
        f"\n{'=' * 64}\n"
        f"BLOCKED: {reason}\n"
        f"{'=' * 64}\n\n"
        f"{indented}\n\n"
        f"{'=' * 64}\n",
        file=sys.stderr,
        flush=True,
    )
    sys.exit(2)


def main() -> None:
    try:
        hook_input = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    command = hook_input.get("tool_input", {}).get("command", "")
    match = _CMD_RE.search(command)
    if not match:
        sys.exit(0)

    resource = match.group(1)  # "issue" or "pr"
    action = match.group(2)    # "create" or "edit"

    # Edits modify existing items — never rate-limit them
    if action == "edit":
        sys.exit(0)

    label = resource.upper() if resource == "pr" else resource.capitalize()

    # Extract target repo directory from cd prefix (fixes CWD bug)
    repo_dir = _extract_repo_dir(command)

    # Create-only checks: duplicate detection and hard limits on OPEN items.
    # `edit` returned above — modifying an existing item never trips a limit.
    _check_duplicate(resource, label, command, cwd=repo_dir)

    total_limit = HARD_LIMITS[resource]
    total = _count_open(resource, cwd=repo_dir)

    if total >= total_limit:
        _block(
            f"{label} creation limit exceeded",
            f"Open {label}s: {total}/{total_limit} (limit reached)\n\n"
            f"Required actions:\n"
            f"  1. Close or resolve duplicate and completed {label}s\n"
            f"  2. Ask the user for explicit permission to create more {label}s",
        )


if __name__ == "__main__":
    main()
