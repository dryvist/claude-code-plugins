#!/usr/bin/env python3
"""Claude Code PreToolUse hook: block non-allowed IP addresses in Write/Edit.

Scans Write `content` and Edit `new_string` for IPv4 literals outside the
allowlist. First attempt blocks with a clear warning explaining the risk
and the allowed alternatives. Second attempt within TTL (same file + IP)
passes through — the retry IS the agent's acknowledgment that the use is
legitimate (private repo, .gitignored file, scratch buffer).

Allowed IPv4 values:
  192.168.0.0/24     sanctioned example CIDR (the ONLY sample range)
  127.0.0.0, .1      loopback
  0.0.0.0            wildcard bind
  255.255.255.x      broadcast
  169.254.169.254    cloud metadata service

State lives in $XDG_CACHE_HOME/content-guards/no-real-ips-state.json
(falls back to ~/.cache/...). Per-(file, ip) timestamps; entries expire
after TTL_SECONDS.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

_OCTET = r"(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)"
IP_PATTERN = re.compile(rf"(?<![\w.]){_OCTET}(?:\.{_OCTET}){{3}}(?![\w.])")

ALLOWED_PATTERNS = [
    re.compile(rf"^192\.168\.0\.{_OCTET}$"),
    re.compile(r"^127\.0\.0\.[01]$"),
    re.compile(r"^0\.0\.0\.0$"),
    re.compile(rf"^255\.255\.255\.{_OCTET}$"),
    re.compile(r"^169\.254\.169\.254$"),
]

VERSION_PIN_PATTERN = re.compile(r"\brev:\s*v?\d")

_CACHE_HOME = Path(os.environ.get("XDG_CACHE_HOME") or (Path.home() / ".cache"))
STATE_FILE = _CACHE_HOME / "content-guards" / "no-real-ips-state.json"
TTL_SECONDS = 300

# Override hooks for tests — single env var keeps the production path clean.
_STATE_OVERRIDE = os.environ.get("NO_REAL_IPS_STATE_FILE")
if _STATE_OVERRIDE:
    STATE_FILE = Path(_STATE_OVERRIDE)


def is_allowed(ip: str) -> bool:
    return any(p.match(ip) for p in ALLOWED_PATTERNS)


def find_violations(content: str) -> list[str]:
    """Return non-allowed IPv4 literals in content, deduped, in first-seen order.

    Skips lines that look like pre-commit version pins ("rev: v1.2.3.4").
    """
    found: list[str] = []
    seen: set[str] = set()
    for line in content.splitlines():
        if VERSION_PIN_PATTERN.search(line):
            continue
        for match in IP_PATTERN.finditer(line):
            ip = match.group(0)
            if is_allowed(ip) or ip in seen:
                continue
            seen.add(ip)
            found.append(ip)
    return found


def load_state() -> dict[str, float]:
    try:
        data = json.loads(STATE_FILE.read_text())
    except (OSError, json.JSONDecodeError):
        return {}
    return {k: float(v) for k, v in data.items() if isinstance(v, (int, float))}


def save_state(state: dict[str, float]) -> None:
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = STATE_FILE.with_suffix(STATE_FILE.suffix + ".tmp")
        tmp.write_text(json.dumps(state))
        os.replace(tmp, STATE_FILE)
    except OSError:
        pass


def prune(state: dict[str, float], now: float) -> dict[str, float]:
    return {k: ts for k, ts in state.items() if now - ts < TTL_SECONDS}


def extract_content(tool_name: str, tool_input: dict) -> str:
    if tool_name == "Write":
        return str(tool_input.get("content") or "")
    if tool_name == "Edit":
        return str(tool_input.get("new_string") or "")
    return ""


def emit(decision: str, reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": reason,
        }
    }))


def main() -> int:
    try:
        hook_input = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0

    tool_name = hook_input.get("tool_name", "")
    if tool_name not in ("Write", "Edit"):
        return 0

    tool_input = hook_input.get("tool_input") or {}
    raw_file_path = str(tool_input.get("file_path") or "")
    file_path = os.path.realpath(raw_file_path) if raw_file_path else ""
    content = extract_content(tool_name, tool_input)

    if not content:
        return 0

    violations = find_violations(content)
    if not violations:
        return 0

    now = time.time()
    state = prune(load_state(), now)

    keys = {ip: f"{file_path}:{ip}" for ip in violations}
    unwarned = [ip for ip in violations if keys[ip] not in state]

    if not unwarned:
        emit("allow", (
            f"WARNING (acknowledged): non-allowed IP(s) in {tool_name} of {file_path}: "
            f"{', '.join(violations)}. Proceeding because this is a retry within the "
            f"{TTL_SECONDS // 60}-min acknowledgment window. Confirm the file is not "
            "committed publicly, or use a value from tests/fixtures.py / 192.168.0.x."
        ))
        return 0

    for ip in unwarned:
        state[keys[ip]] = now
    save_state(state)

    emit("deny", (
        f"BLOCKED (first attempt): non-allowed IP(s) in {tool_name} of {file_path}: "
        f"{', '.join(unwarned)}.\n\n"
        "These IPs look like live network artifacts (often pasted from kubectl/cribl "
        "tool output) and will leak into the repo if committed.\n\n"
        "Preferred fixes:\n"
        "  1. Replace with 192.168.0.x (the only sanctioned sample CIDR), or import "
        "a constant from the repo's tests/fixtures.py if one exists.\n"
        "  2. Reference the real value via a secret / env var.\n\n"
        "If this use is legitimate (private repo, .gitignored file, scratch buffer), "
        f"retry the same {tool_name} within {TTL_SECONDS // 60} minutes. The retry IS "
        "your acknowledgment that you accept the risk."
    ))
    return 0


if __name__ == "__main__":
    sys.exit(main())
