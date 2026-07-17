#!/usr/bin/env python3
"""Public-repo leakage pre-flight hook (PreToolUse: Write, Edit).

Blocks a Write/Edit that would commit a real private-infrastructure identifier
into a PUBLIC GitHub repo: a specific host IP or an infrastructure VMID.
Documentation examples pass - CIDR ranges, RFC 5737 doc ranges, loopback, and
well-known public resolvers.

Scope gate: acts only when the target file's repo is confirmed PUBLIC. Private
repo, non-git path, or any lookup failure -> do nothing (fail-open). Visibility
is resolved once per repo via gh and cached.

This file is in a public repo, so it hardcodes NO private values - detection is
generic and value-agnostic. Exit 0 = allow, 2 = block.
"""

from __future__ import annotations

import hashlib
import ipaddress
import json
import os
import re
import subprocess
import sys
import time

_IP_RE = re.compile(r"(?<![\w.])(\d{1,3}(?:\.\d{1,3}){3})(/\d{1,2})?(?![\w.])")

_VMID_RE = re.compile(
    r"\b(?:vm(?:id)?|ct(?:id)?|guest[_-]?id)\s*[:=]\s*(\d{3,})\b"
    r"|\b(?:pct|qm)\s+\w+\s+(\d{3,})\b"
    r"|\bCT\s+(\d{4,})\b",
    re.IGNORECASE,
)

# RFC 5737 documentation ranges. Python 3.12+ reports these as is_private, so
# exclude them explicitly — they are the canonical "use this in examples" IPs.
_DOC_NETS = [
    ipaddress.ip_network(n)
    for n in ("192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24")
]


def _is_leak_ip(addr: str, has_cidr: bool) -> bool:
    """A leak is a bare PRIVATE host address (RFC1918/ULA) — real homelab topology.

    Public IPs are deliberately NOT flagged: they are already public, and bare
    dotted quads (version strings like 1.2.3.4, CDN IPs) would false-positive
    constantly and train people to ignore the guard. Examples use CIDR ranges or
    RFC 5737 doc ranges, which stay private=False and pass. A CIDR range is a
    range, not a host, so it never flags.
    """
    if has_cidr:
        return False
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return False
    if ip.is_loopback or ip.is_link_local or ip.is_unspecified or ip.is_multicast:
        return False
    if any(ip in net for net in _DOC_NETS):
        return False
    return ip.is_private


def detect_leaks(text: str) -> list[tuple[str, str]]:
    """Return [(kind, value)] of real-infra identifiers. Empty list = clean."""
    found: list[tuple[str, str]] = []
    for m in _IP_RE.finditer(text):
        addr, cidr = m.group(1), m.group(2)
        try:
            ipaddress.ip_address(addr)
        except ValueError:
            continue
        if _is_leak_ip(addr, bool(cidr)):
            found.append(("private host IP", addr))
    for m in _VMID_RE.finditer(text):
        vmid = next(g for g in m.groups() if g)
        found.append(("infra VMID", vmid))
    return found


_CACHE_DIR = os.path.expanduser("~/.cache/leakage-guard")
_CACHE_TTL = 3600


def _repo_root(path: str) -> str | None:
    try:
        r = subprocess.run(
            ["git", "-C", os.path.dirname(path) or ".", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=5,
        )
        return (r.stdout.strip() or None) if r.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None


def _is_public_repo(path: str) -> bool:
    root = _repo_root(path)
    if not root:
        return False
    key = hashlib.sha256(root.encode()).hexdigest()[:16]
    cache = os.path.join(_CACHE_DIR, f"{key}.json")
    try:
        if time.time() - os.stat(cache).st_mtime < _CACHE_TTL:
            with open(cache) as fh:
                return json.load(fh).get("visibility") == "PUBLIC"
    except (OSError, ValueError):
        pass
    try:
        r = subprocess.run(
            ["gh", "repo", "view", "--json", "visibility", "--jq", ".visibility"],
            capture_output=True, text=True, timeout=10, cwd=root,
        )
        vis = r.stdout.strip() if r.returncode == 0 else "UNKNOWN"
    except (OSError, subprocess.SubprocessError):
        vis = "UNKNOWN"
    try:
        os.makedirs(_CACHE_DIR, exist_ok=True)
        with open(cache, "w") as fh:
            json.dump({"visibility": vis}, fh)
    except OSError:
        pass
    return vis == "PUBLIC"


def _new_content(tool_name: str, tool_input: dict) -> str:
    if tool_name == "Write":
        return str(tool_input.get("content", ""))
    if tool_name == "Edit":
        return str(tool_input.get("new_string", ""))
    return ""


def _block(path: str, leaks: list[tuple[str, str]]) -> None:
    items = "\n".join(f"  - {kind}: {val}" for kind, val in leaks)
    print(
        f"\n{'=' * 64}\nBLOCKED: possible private-infra leak into a PUBLIC repo\n"
        f"{'=' * 64}\n\n  File: {path}\n"
        f"  This write adds identifiers that look like real infrastructure:\n"
        f"{items}\n\n"
        f"  Public repos must not carry real host IPs or VMIDs. Use an FQDN, a\n"
        f"  CIDR range, or an RFC 5737 doc address (192.0.2.x, 198.51.100.x,\n"
        f"  203.0.113.x). If this is genuinely an example, write it as a range.\n\n"
        f"{'=' * 64}\n",
        file=sys.stderr, flush=True,
    )
    sys.exit(2)


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)
    tool_name = data.get("tool_name", "")
    if tool_name not in ("Write", "Edit"):
        sys.exit(0)
    tool_input = data.get("tool_input", {})
    path = tool_input.get("file_path", "")
    if not path:
        sys.exit(0)
    leaks = detect_leaks(_new_content(tool_name, tool_input))
    if leaks and _is_public_repo(path):
        _block(path, leaks)
    sys.exit(0)


if __name__ == "__main__":
    main()
