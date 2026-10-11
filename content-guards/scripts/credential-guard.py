#!/usr/bin/env python3
"""Credential pre-flight hook (PreToolUse: Write, Edit, MultiEdit, Bash).

One process, four rules, no external calls:

  password-literal-assign  WARN   a write assigns a literal password-like value
  public-repo-leakage      BLOCK  a write under /git/public/ names an internal
                                  host, a node name, a private tool or a
                                  non-private IPv4 address
  secret-redirect-to-file  BLOCK  a shell command redirects secret material
                                  into a file
  secret-shapes-on-disk    BLOCK  a write contains a credential-shaped string

The detection is value-agnostic: it matches shapes, not specific secrets, so
this public file carries no private value. Matching is case-insensitive.

Fail-open: malformed input or any internal error allows the call. Block output
is the PreToolUse deny JSON on stdout with exit 0; a warning is a systemMessage.
"""

from __future__ import annotations

import json
import re
import sys

_FLAGS = re.IGNORECASE

# Private, loopback, link-local, CGNAT, documentation and well-known resolver
# ranges are the only IPv4 forms a public repo may carry.
_ALLOWED_IPV4_PREFIX = (
    r"10\.|127\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|169\.254\.|"
    r"100\.(?:6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.|0\.|255\.|"
    r"192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|"
    r"1\.1\.1\.1|8\.8\.8\.8|8\.8\.4\.4|9\.9\.9\.9"
)
_OCTET = r"(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])"

_PASSWORD_ASSIGN = re.compile(
    r"""password['"]?\s*[:=]\s*['"][^'"]{8,}['"]""", _FLAGS
)

_PUBLIC_LEAKAGE = re.compile(
    r"\.pve\.[a-z0-9-]+\.(?:com|net|org)"
    r"|\bpve[0-9]\b"
    r"|screen.?pipe"
    rf"|\b(?!{_ALLOWED_IPV4_PREFIX}){_OCTET}\.{_OCTET}\.{_OCTET}\.{_OCTET}\b",
    _FLAGS,
)

_SECRET_WORDS = r"(?:SECRET|TOKEN|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY)"
_SECRET_REDIRECT = re.compile(
    rf"""(?:echo|printf)[^|;&]*\$[{{(]?[A-Za-z_]*{_SECRET_WORDS}[^|;&]*>{{1,2}}\s*[A-Za-z0-9/._~'"]"""
    r"""|find-generic-password[^|;&]*>{1,2}\s*[A-Za-z0-9/._~'"]""",
    _FLAGS,
)

_SECRET_SHAPES = re.compile(
    r"AKIA(?!IOSFODNN7EXAMPLE)[0-9A-Z]{16}"
    r"|gh[pousr]_[A-Za-z0-9]{20,}"
    r"|github_pat_[A-Za-z0-9_]{22,}"
    r"|BEGIN [A-Z ]*PRIVATE KEY",
    _FLAGS,
)

_WARN_PASSWORD = (
    "WARNING: this write assigns a literal password-like value. If this is a real "
    "credential, stop. Secrets must never be written to disk; inject them from the "
    "keychain or Doppler at use time. If it is a test fixture or documentation, use "
    "an obvious placeholder (for example CHANGE_ME)."
)
_BLOCK_LEAKAGE = (
    "BLOCKED: this write targets a PUBLIC repo path and contains an internal "
    "hostname or domain, an internal node name, a private tool reference, or a "
    "non-private IP address. Public repos may carry only RFC1918, loopback, "
    "link-local, CGNAT, documentation-range or well-known resolver addresses. "
    "Replace internal names with placeholders or variables. If this is a false "
    "positive (a four-part version string that looks like an IP), tell the user "
    "what matched and ask how to proceed."
)
_BLOCK_REDIRECT = (
    "BLOCKED: this command redirects secret material into a file. Keep the value "
    "in a shell variable inside a single command, or pipe it straight to the "
    "consumer. Never via a file, and never print it."
)
_BLOCK_SHAPES = (
    "BLOCKED: this write contains a credential-shaped string (AWS access key, "
    "GitHub token or private key material). Secrets must never be written to disk. "
    "Read the secret into a shell variable in the command that consumes it. For "
    "documentation, use the official placeholder forms."
)


def new_text(tool_name: str, tool_input: dict) -> str:
    """Text a file tool would add; every payload variant is scanned."""
    if tool_name == "Write":
        return str(tool_input.get("content", ""))
    if tool_name == "Edit":
        return str(tool_input.get("new_string") or tool_input.get("content", ""))
    if tool_name == "MultiEdit":
        edits = tool_input.get("edits") or []
        return "\n".join(str(e.get("new_string", "")) for e in edits if isinstance(e, dict))
    return ""


def evaluate(tool_name: str, tool_input: dict) -> tuple[str, str] | None:
    """Return ("block" | "warn", message) or None when the call is clean."""
    if tool_name == "Bash":
        if _SECRET_REDIRECT.search(str(tool_input.get("command", ""))):
            return "block", _BLOCK_REDIRECT
        return None
    text = new_text(tool_name, tool_input)
    if not text:
        return None
    path = str(tool_input.get("file_path", ""))
    if _SECRET_SHAPES.search(text):
        return "block", _BLOCK_SHAPES
    if "/git/public/" in path and _PUBLIC_LEAKAGE.search(text):
        return "block", _BLOCK_LEAKAGE
    if _PASSWORD_ASSIGN.search(text):
        return "warn", _WARN_PASSWORD
    return None


def main() -> None:
    try:
        data = json.load(sys.stdin)
        verdict = evaluate(data.get("tool_name", ""), data.get("tool_input") or {})
    except Exception:  # fail-open: a guard bug must never stop a tool call
        sys.exit(0)
    if verdict is None:
        sys.exit(0)
    kind, message = verdict
    if kind == "block":
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": message,
            }
        }))
    else:
        print(json.dumps({"systemMessage": message}))
    sys.exit(0)


if __name__ == "__main__":
    main()
