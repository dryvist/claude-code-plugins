#!/usr/bin/env python3
"""
secret-guard.py - PreToolUse hook to block hardcoded sensitive homelab values.

Inspects the content being written by Write/Edit/MultiEdit/NotebookEdit and
denies the operation if it matches either:

  1. LITERAL prong - a private, newline-separated POSIX-ERE denylist
     (`SENSITIVE_DENYLIST`) loaded from the macOS auto-readable keychain. This
     list holds the EXACT real domain, Proxmox node names, ZFS pool names, AWS
     account ID, etc. It is NEVER committed; agents only reference it by name.

  2. STRUCTURAL prong - value-free shape checks for RFC1918 internal IP literals
     (`10.`, `192.168.`, `172.16-31.`). Fake test values (RFC2544 `198.18`/
     `198.19`, `example.invalid`) are allowlisted so fixtures and this repo's own
     docs never trip the guard. A configurable real-domain shape is also
     supported but OFF by default (see SECRET_GUARD_DOMAIN_REGEX) - it fires on
     every write, so a broad TLD match would be hostile; the real domain is
     caught precisely by the literal prong instead.

Fail mode: fail-OPEN. Any internal error, a missing/empty denylist, or an
unreadable keychain results in ALLOW plus a one-line stderr warning - a fresh
clone or external contributor without the keychain entry is never blocked, and
a Write is never crashed by this hook. The structural prong still runs even
when the literal denylist is unavailable.

Deny protocol (mirrors content-guards/webfetch-guard.py and
git-guards/main-branch-guard.py): JSON on stdout with permissionDecision=deny,
exit 0.

Environment overrides (for testing only):
  SENSITIVE_DENYLIST_KEYCHAIN_SERVICE - keychain service name to read instead
    of the default `SENSITIVE_DENYLIST` (point tests at a fake TEST service).
  SECRET_GUARD_DOMAIN_REGEX - override the structural real-domain regex.
"""

import json
import os
import re
import subprocess
import sys

DEFAULT_KEYCHAIN_SERVICE = "SENSITIVE_DENYLIST"

# Structural real-IP shapes (RFC1918). Value-free - matches the shape, not a
# specific homelab subnet. Word-ish boundaries avoid matching inside longer
# numbers (e.g. version strings, timestamps).
_RFC1918_PATTERNS = [
    r"(?<!\d)10\.\d{1,3}\.\d{1,3}\.\d{1,3}",
    r"(?<!\d)192\.168\.\d{1,3}\.\d{1,3}",
    r"(?<!\d)172\.(?:1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3}",
]
_RFC1918_RE = re.compile("|".join(_RFC1918_PATTERNS))

# Fake test/documentation values that must always be allowed. These let the
# repo's own fixtures and docs reference IP/domain shapes without tripping the
# guard. RFC2544 benchmarking block 198.18.0.0/15 + RFC6761 example.invalid.
_ALLOWLIST_RE = re.compile(
    r"198\.1[89]\.\d{1,3}\.\d{1,3}"
    r"|(?:[A-Za-z0-9-]+\.)*example\.invalid",
    re.IGNORECASE,
)

# Structural real-domain shape. DISABLED by default (empty regex matches
# nothing) because this hook fires on EVERY write across all repos: a broad
# TLD match would deny ordinary content mentioning github.com, anthropic.com,
# example.com, etc., making the guard hostile. The real homelab domain is
# caught precisely by the LITERAL keychain prong instead. A repo that wants a
# structural domain backstop sets SECRET_GUARD_DOMAIN_REGEX to its own shape
# (example.invalid stays allowlisted). Empty string => prong off.
_DEFAULT_DOMAIN_REGEX = ""


def deny(category: str) -> None:
    """Emit the ecosystem deny protocol and exit 0.

    The matched VALUE is never echoed - only the category - so a secret that
    triggered the guard is not re-surfaced in the decision reason.
    """
    reason = (
        "secret-guard: content matches a sensitive homelab value "
        f"(category: {category}) - parameterize via Doppler/SOPS instead of "
        "hardcoding (see SENSITIVE_DENYLIST). Reference the value from runtime "
        "config or an encrypted file; do not write the literal into a public repo."
    )
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


def load_denylist() -> list[re.Pattern]:
    """Load and compile the literal denylist from the keychain.

    Returns an empty list (fail-open) on any failure: keychain miss, empty
    value, unreadable entry, or a malformed regex line. Comment (`#`) and blank
    lines are ignored. Each non-comment line is a POSIX-ERE pattern.
    """
    service = os.environ.get(
        "SENSITIVE_DENYLIST_KEYCHAIN_SERVICE", DEFAULT_KEYCHAIN_SERVICE
    )
    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-s", service, "-w"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError) as e:
        print(
            f"Warning: secret-guard could not read keychain denylist ({e}); "
            "literal prong skipped (fail-open).",
            file=sys.stderr,
        )
        return []

    if result.returncode != 0 or not result.stdout.strip():
        print(
            "Warning: secret-guard denylist unavailable or empty; literal prong "
            "skipped (fail-open).",
            file=sys.stderr,
        )
        return []

    patterns: list[re.Pattern] = []
    for raw in result.stdout.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        try:
            patterns.append(re.compile(line))
        except re.error:
            print(
                "Warning: secret-guard skipped an invalid denylist pattern.",
                file=sys.stderr,
            )
            continue
    return patterns


def _strip_allowlisted(text: str) -> str:
    """Remove fake test/doc values so they cannot trigger structural matches."""
    return _ALLOWLIST_RE.sub("", text)


def domain_regex() -> re.Pattern | None:
    """Compile the structural domain regex, or None when the prong is off.

    An empty pattern means "disabled" - returning None (rather than a compiled
    empty regex, which would spuriously match every string at position 0).
    """
    pattern = os.environ.get("SECRET_GUARD_DOMAIN_REGEX", _DEFAULT_DOMAIN_REGEX)
    if not pattern:
        return None
    try:
        return re.compile(pattern, re.IGNORECASE)
    except re.error:
        return None


def check_content(content: str, denylist: list[re.Pattern]) -> str | None:
    """Return a category name if content matches a denied pattern, else None."""
    if not content:
        return None

    # Literal prong runs against the RAW content (the real denylist values are
    # never the fake allowlisted ones, so no stripping needed here).
    for pattern in denylist:
        if pattern.search(content):
            return "literal-denylist"

    # Structural prong runs against allowlist-stripped content so fake test
    # values do not produce false positives.
    scrubbed = _strip_allowlisted(content)
    if _RFC1918_RE.search(scrubbed):
        return "structural-rfc1918-ip"
    domain_re = domain_regex()
    if domain_re is not None and domain_re.search(scrubbed):
        return "structural-real-domain"

    return None


def extract_content(tool_name: str, tool_input: dict) -> str:
    """Concatenate every content-bearing field for the given tool."""
    parts: list[str] = []

    if tool_name == "Write":
        parts.append(tool_input.get("content", ""))
    elif tool_name == "Edit":
        parts.append(tool_input.get("new_string", ""))
    elif tool_name == "MultiEdit":
        for edit in tool_input.get("edits", []):
            if isinstance(edit, dict):
                parts.append(edit.get("new_string", ""))
    elif tool_name == "NotebookEdit":
        # NotebookEdit writes a single cell's source.
        parts.append(tool_input.get("new_source", ""))

    return "\n".join(p for p in parts if isinstance(p, str) and p)


def main() -> None:
    try:
        hook_input = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)  # Invalid input - fail-open

    try:
        tool_name = hook_input.get("tool_name", "")
        if tool_name not in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
            sys.exit(0)

        tool_input = hook_input.get("tool_input", {})
        if not isinstance(tool_input, dict):
            sys.exit(0)

        content = extract_content(tool_name, tool_input)
        if not content:
            sys.exit(0)

        denylist = load_denylist()
        category = check_content(content, denylist)
        if category:
            deny(category)
    except Exception as e:  # noqa: BLE001 - fail-open is intentional and total
        print(
            f"Warning: secret-guard internal error ({e}); allowing write "
            "(fail-open).",
            file=sys.stderr,
        )
        sys.exit(0)

    sys.exit(0)  # Allow


if __name__ == "__main__":
    main()
