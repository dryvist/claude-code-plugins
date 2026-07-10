#!/usr/bin/env python3
"""
Claude Code PreToolUse hook for GitHub issue and PR rate limiting.

Blocks `gh issue create` and `gh pr create` when limits are exceeded.
Uses `--author @me` for identity-based filtering (unforgeable).

Hard limits (per-repo):
  - 100 total open issues
  - 15 total open PRs
  - 25 AI-created open issues/PRs (labeled "ai-created")

Rate limits (24h rolling window), configurable WITHOUT a code change:
  - GH_ACTION_LIMIT_ISSUE / GH_ACTION_LIMIT_PR — read from the environment
    first, then from the target repo owner's GitHub Actions org variable of
    the same name (settable via Doppler -> GH org variable sync), else 50.

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
from datetime import datetime, timedelta, timezone

# Hard limits: (total_open, ai_created_open) per resource type
HARD_LIMITS = {"issue": (100, 25), "pr": (15, 15)}

# 24h rolling rate limit default; overridable per resource type via
# GH_ACTION_LIMIT_{ISSUE|PR} (env, then the repo owner's Actions org variable).
RATE_LIMIT_24H_DEFAULT = 50

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


def _get_counts(resource: str, cwd: str | None = None) -> tuple[int, int]:
    """Count total and AI-created open items for a resource type."""
    items = _gh_json([
        resource, "list", "--state", "open",
        "--json", "number,labels", "--limit", "100",
    ], cwd=cwd)
    total = len(items)
    ai_created = sum(
        1 for item in items
        if any(label["name"] == "ai-created" for label in item.get("labels", []))
    )
    return total, ai_created


def _gh_text(args: list[str], cwd: str | None = None) -> str | None:
    """Run a gh command that returns plain text, None on any error."""
    try:
        result = subprocess.run(
            ["gh", *args],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
            cwd=cwd,
        )
        return result.stdout.strip()
    except _GH_ERRORS:
        return None


def _rate_limit_24h(resource: str, cwd: str | None = None) -> int:
    """Resolve the 24h rate limit for a resource type.

    Precedence: GH_ACTION_LIMIT_{ISSUE|PR} in the environment, then the same
    name as a GitHub Actions org variable on the target repo's owner, then the
    built-in default. Any lookup failure falls back to the default.
    """
    name = f"GH_ACTION_LIMIT_{resource.upper()}"
    value = os.environ.get(name)
    if value is None:
        # Org variables only exist for organization-owned repos; skip the API
        # round-trip entirely for user-owned ones.
        owner = _gh_text(
            [
                "repo", "view",
                "--json", "owner,isInOrganization",
                "--jq", 'select(.isInOrganization) | .owner.login',
            ],
            cwd=cwd,
        )
        if owner:
            value = _gh_text(
                ["api", f"orgs/{owner}/actions/variables/{name}", "--jq", ".value"],
                cwd=cwd,
            )
    if value is None:
        return RATE_LIMIT_24H_DEFAULT
    try:
        limit = int(value)
    except ValueError:
        return RATE_LIMIT_24H_DEFAULT
    return limit if limit > 0 else RATE_LIMIT_24H_DEFAULT


def _count_recent(resource: str, cwd: str | None = None) -> int:
    """Count items created by @me in the last 24 hours."""
    items = _gh_json([
        resource, "list", "--state", "all",
        "--author", "@me",
        "--json", "createdAt", "--limit", "100",
    ], cwd=cwd)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    return sum(
        1 for item in items
        if item.get("createdAt")
        and datetime.fromisoformat(item["createdAt"].replace("Z", "+00:00")) >= cutoff
    )


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

    # Create-only checks: duplicate detection and hard limits
    if action == "create":
        _check_duplicate(resource, label, command, cwd=repo_dir)

        total_limit, ai_limit = HARD_LIMITS[resource]
        total, ai_created = _get_counts(resource, cwd=repo_dir)

        reasons = []
        if total >= total_limit:
            reasons.append(f"Total {label}s: {total}/{total_limit} (limit reached)")
        if ai_created >= ai_limit:
            reasons.append(f"AI-created {label}s: {ai_created}/{ai_limit} (limit reached)")
        if reasons:
            reasons_str = "\n  ".join(reasons)
            _block(
                f"{label} creation limit exceeded",
                f"{reasons_str}\n\n"
                f"Required actions:\n"
                f"  1. Close or resolve duplicate and completed {label}s\n"
                f"  2. Ask the user for explicit permission to create more {label}s",
            )

    # 24h rate limit (create only — edits are always allowed)
    if action == "create":
        rate_limit = _rate_limit_24h(resource, cwd=repo_dir)
        recent = _count_recent(resource, cwd=repo_dir)
        if recent >= rate_limit:
            _block(
                "Rate limit exceeded",
                f"{recent} {label}s created in the past 24 hours (limit: {rate_limit}).\n\n"
                f"Raise it without a code change via the GH_ACTION_LIMIT_{resource.upper()}\n"
                "env var or the same-named GitHub Actions org variable, or the user\n"
                "can re-run the blocked command directly in their terminal.",
            )


if __name__ == "__main__":
    main()
