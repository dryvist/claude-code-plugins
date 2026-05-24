#!/usr/bin/env python3
"""PreToolUse hook: block sensitive content in Write/Edit. See README."""
from __future__ import annotations

import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

VERSION_PIN = re.compile(r"\brev:\s*v?\d")
HASH_LINE = re.compile(r"\b(?:sha\d+|md5|cas)[-: ]", re.IGNORECASE)
EMAIL_PLACEHOLDER = re.compile(r"<[A-Za-z][A-Za-z0-9._-]*@[A-Za-z0-9._-]*>")
LINK_REF = re.compile(r"^\s*\[[^\]]+\]:\s")
REPO_LINE = re.compile(r"^\s*repo:\s")
IMAGE_LINE = re.compile(r"^\s*image:\s")

_OCT = r"(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)"
IPV4 = re.compile(rf"(?<![\w.]){_OCT}(?:\.{_OCT}){{3}}(?![\w.])")
_IPV4_OK = [re.compile(p) for p in (
    rf"^192\.168\.0\.{_OCT}$", r"^127\.0\.0\.[01]$", r"^0\.0\.0\.0$",
    rf"^255\.255\.255\.{_OCT}$", r"^169\.254\.169\.254$",
)]

_H = r"[0-9A-Fa-f]{1,4}"
IPV6 = re.compile(
    rf"(?<![\w:])(?:{_H}(?::{_H}){{7}}"
    rf"|(?:{_H}:){{1,7}}:(?:{_H}(?::{_H}){{0,6}})?"
    rf"|:(?::{_H}){{1,7}}|::)(?![\w:])"
)

EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_EMAIL_SUFFIX = (
    "@users.noreply.github.com", "@example.com", "@example.org",
    "@example.net", "@example.local", "@test", "@localhost",
)
_EMAIL_PREFIX = ("your-email@", "email@example.", "user@example.")

USER_PATH = re.compile(r"(?:/Users|/home)/[A-Za-z][A-Za-z0-9._-]*/")
_REAL_USER = os.environ.get("USER", "")

PRIVATE_KEY = re.compile(
    r"-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----"
)

AWS_ACCT = re.compile(r"(?<![\d.])\d{12}(?![\d.])")
AWS_CTX = re.compile(r"account[_ ]?id|arn:aws:|aws_account_id|:account:", re.IGNORECASE)

DOMAIN = re.compile(
    r"\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}\b", re.IGNORECASE
)
# Explicit; keeps the false-positive surface auditable.
FILE_EXTENSION_TLDS = frozenset((
    "md mdx rst tex bib py js ts tsx jsx json yaml yml toml lock lockb sh "
    "bash zsh fish nix tf hcl go rs rb html css scss svg png jpg jpeg gif "
    "pdf txt csv xml zip tar gz bz2 7z mp3 mp4 mov dockerignore gitignore "
    "log ini cfg conf env example sample template j2 ipynb sql proto "
    "graphql gql vue svelte c h cpp hpp cc cxx java kt swift m mm php pl "
    "lua r jl dart elm ex exs erl bats"
).split())
_DOMAIN_SUFFIX = (
    ".example.com", ".example.org", ".example.net", ".example.local",
    ".example", ".test", ".localhost", ".invalid", ".local",
    ".users.noreply.github.com",
)
_DOMAIN_EXACT = frozenset((
    "example.com", "example.org", "example.net", "example.local",
    "your-domain.com", "your-domain.example",
    "github.com", "api.github.com", "raw.githubusercontent.com",
    "docs.jacobpevans.com", "runs-on.com", "healthchecks.io",
    "noreply.github.com", "users.noreply.github.com",
))


def _ipv4_allowed(v: str) -> bool:
    return any(p.match(v) for p in _IPV4_OK)


def _ipv6_allowed(v: str) -> bool:
    v = v.lower()
    if v in ("::", "::1"):
        return True
    if v.startswith(("fe80:", "fe80::", "2001:db8:", "2001:db8::")):
        return True
    return bool(re.match(r"^(?:f[cd][0-9a-f]{0,2}|ff[0-9a-f]{2}):", v))


def _email_allowed(v: str) -> bool:
    v = v.lower()
    return (v == "noreply@github.com"
            or v.endswith(_EMAIL_SUFFIX) or v.startswith(_EMAIL_PREFIX))


def _user_path_allowed(v: str) -> bool:
    lower = v.lower()
    if "<user>" in lower or "$user" in lower or "${user}" in lower:
        return True
    return bool(_REAL_USER) and v.endswith(f"/{_REAL_USER}/")


def _aws_allowed(v: str) -> bool:
    return v in {"123456789012", "000000000000"} or len(set(v)) == 1


def _domain_allowed(v: str) -> bool:
    v = v.lower()
    if v in _DOMAIN_EXACT or v.endswith(_DOMAIN_SUFFIX):
        return True
    return v.rsplit(".", 1)[-1] in FILE_EXTENSION_TLDS


def _domain_skip(line: str) -> bool:
    return bool(
        REPO_LINE.match(line) or IMAGE_LINE.match(line)
        or LINK_REF.match(line) or EMAIL_PLACEHOLDER.search(line)
    )


def _ip_skip(line: str) -> bool:
    return bool(VERSION_PIN.search(line) or HASH_LINE.search(line))


@dataclass
class Detector:
    name: str
    pattern: re.Pattern
    is_allowed: Callable[[str], bool]
    message_hint: str
    skip_line: Optional[Callable[[str], bool]] = None
    line_context: Optional[Callable[[str], bool]] = None
    normalize: Callable[[str], str] = field(default=lambda v: v)


DETECTORS: list[Detector] = [
    Detector("ipv4", IPV4, _ipv4_allowed,
             "use 192.168.0.x sample CIDR or env/secret.",
             skip_line=lambda l: bool(VERSION_PIN.search(l))),
    Detector("ipv6", IPV6, _ipv6_allowed,
             "use 2001:db8:: (RFC 3849 doc prefix), fe80::, ::1, or env var.",
             skip_line=_ip_skip),
    Detector("email", EMAIL, _email_allowed,
             "use `<email>`, *@example.com, or a GitHub no-reply variant.",
             skip_line=lambda l: bool(EMAIL_PLACEHOLDER.search(l))),
    Detector("absolute_user_path", USER_PATH, _user_path_allowed,
             "use ${HOME}, ~, ${USER}, or <user> placeholders."),
    Detector("private_key_header", PRIVATE_KEY, lambda _v: False,
             "private keys belong in keychain/SOPS/Doppler, never a file."),
    Detector("aws_account_id", AWS_ACCT, _aws_allowed,
             "use 123456789012 (AWS sample) or ${AWS_ACCOUNT_ID}.",
             line_context=lambda l: bool(AWS_CTX.search(l))),
    Detector("real_domain", DOMAIN, _domain_allowed,
             "use example.com, *.test, *.localhost, or env var.",
             skip_line=_domain_skip, normalize=str.lower),
]

_CACHE = Path(os.environ.get("XDG_CACHE_HOME") or (Path.home() / ".cache"))
STATE_FILE = _CACHE / "content-guards" / "sensitive-content-state.json"
TTL_SECONDS = 300
if (_override := os.environ.get("SENSITIVE_CONTENT_STATE_FILE")):
    STATE_FILE = Path(_override)


def find_violations(content: str) -> list[tuple[Detector, str]]:
    found: list[tuple[Detector, str]] = []
    seen: set[tuple[str, str]] = set()
    for line in content.splitlines():
        for det in DETECTORS:
            if det.skip_line and det.skip_line(line):
                continue
            if det.line_context and not det.line_context(line):
                continue
            for match in det.pattern.finditer(line):
                value = det.normalize(match.group(0))
                if det.is_allowed(value):
                    continue
                key = (det.name, value)
                if key in seen:
                    continue
                seen.add(key)
                found.append((det, value))
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
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": decision,
        "permissionDecisionReason": reason,
    }}))


def _group(violations: list[tuple[Detector, str]]) -> list[tuple[Detector, list[str]]]:
    order: list[Detector] = []
    by_name: dict[str, list[str]] = {}
    for det, value in violations:
        if det.name not in by_name:
            by_name[det.name] = []
            order.append(det)
        by_name[det.name].append(value)
    return [(det, by_name[det.name]) for det in order]


def _format(groups: list[tuple[Detector, list[str]]], hint: bool) -> str:
    lines = []
    for det, values in groups:
        head = f"  [{det.name}] {', '.join(values)}"
        if hint and det.message_hint:
            head += f"\n    -> {det.message_hint}"
        lines.append(head)
    return "\n".join(lines)


def main() -> int:
    try:
        hook_input = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    tool_name = hook_input.get("tool_name", "")
    if tool_name not in ("Write", "Edit"):
        return 0
    tool_input = hook_input.get("tool_input") or {}
    raw_path = str(tool_input.get("file_path") or "")
    file_path = os.path.realpath(raw_path) if raw_path else ""
    content = extract_content(tool_name, tool_input)
    if not content:
        return 0
    violations = find_violations(content)
    if not violations:
        return 0

    now = time.time()
    state = prune(load_state(), now)
    keys = {(d.name, v): f"{file_path}:{d.name}:{v}" for d, v in violations}
    unwarned = [(d, v) for d, v in violations if keys[(d.name, v)] not in state]

    if not unwarned:
        emit("allow", (
            f"WARNING (acknowledged): sensitive content in {tool_name} of "
            f"{file_path}:\n{_format(_group(violations), hint=False)}\n\n"
            f"Proceeding because this is a retry within the {TTL_SECONDS // 60}-min "
            "window. Confirm the file is not committed publicly."
        ))
        return 0

    for det, value in unwarned:
        state[keys[(det.name, value)]] = now
    save_state(state)
    emit("deny", (
        f"BLOCKED (first attempt): sensitive content in {tool_name} of "
        f"{file_path}:\n{_format(_group(unwarned), hint=True)}\n\n"
        "These values look like real artifacts and would leak if committed.\n"
        f"Retry within {TTL_SECONDS // 60} min to acknowledge and proceed."
    ))
    return 0


if __name__ == "__main__":
    sys.exit(main())
