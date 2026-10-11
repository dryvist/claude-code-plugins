#!/usr/bin/env python3
"""Tests for credential-guard.py evaluate() - the pure detection core.

Run: python3 content-guards/scripts/test_credential_guard.py
Credential-shaped samples are assembled at runtime so this file carries none.
"""

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).parent / "credential-guard.py"
spec = importlib.util.spec_from_file_location("credential_guard", str(SCRIPT))
assert spec is not None and spec.loader is not None
cg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cg)

PUB = "/home/u/git/public/x/y.md"
PRIV = "/home/u/git/private/x/y.md"
AWS_KEY = "AK" + "IA" + "ABCDEFGHIJKLMNOP"
GH_TOKEN = "gh" + "p_" + "a" * 24
PEM = "-----BEGIN " + "RSA PRIVATE" + " KEY-----"
PRIVATE_IP = ".".join(["10", "1", "2", "3"])
PUBLIC_IP =".".join(["203", "44", "12", "9"])
PVE_HOST = "node" + ".pve." + "lab" + ".com"
PASSWORD = "password" + ' = "' + "hunter2hunter2" + '"'

# (label, tool, input, expected kind or None)
CASES = [
    ("aws key", "Write", {"file_path": PRIV, "content": AWS_KEY}, "block"),
    ("aws doc example", "Write", {"file_path": PRIV, "content": "AK" + "IAIOSFODNN7EXAMPLE"}, None),
    ("gh token", "Edit", {"file_path": PRIV, "new_string": GH_TOKEN}, "block"),
    ("private key", "Write", {"file_path": PRIV, "content": PEM}, "block"),
    ("multiedit token", "MultiEdit", {"file_path": PRIV, "edits": [{"new_string": GH_TOKEN}]}, "block"),
    ("public ip in public repo", "Write", {"file_path": PUB, "content": f"host {PUBLIC_IP}"}, "block"),
    ("public ip in private repo", "Write", {"file_path": PRIV, "content": f"host {PUBLIC_IP}"}, None),
    ("rfc1918 in public repo", "Write", {"file_path": PUB, "content": "host " + PRIVATE_IP}, None),
    ("doc range in public repo", "Write", {"file_path": PUB, "content": "host 203.0.113.9"}, None),
    ("pve host in public repo", "Write", {"file_path": PUB, "content": PVE_HOST}, "block"),
    ("pve node name", "Write", {"file_path": PUB, "content": "run on pve2 now"}, "block"),
    ("password literal", "Write", {"file_path": PRIV, "content": PASSWORD}, "warn"),
    ("password short", "Write", {"file_path": PRIV, "content": 'password = "x"'}, None),
    ("secret echo redirect", "Bash", {"command": 'echo "$API_TOKEN" > out.txt'}, "block"),
    ("keychain redirect", "Bash", {"command": "security find-generic-password -s x -w > f"}, "block"),
    ("echo piped", "Bash", {"command": 'echo "$API_TOKEN" | consumer'}, None),
    ("plain echo", "Bash", {"command": "echo hello > out.txt"}, None),
    ("read tool ignored", "Read", {"file_path": PUB}, None),
    ("empty write", "Write", {"file_path": PUB, "content": ""}, None),
]


def run() -> int:
    failed = 0
    for label, tool, tool_input, want in CASES:
        got = cg.evaluate(tool, tool_input)
        kind = got[0] if got else None
        if kind != want:
            failed += 1
            print(f"FAIL {label}: want {want}, got {kind}")
    print(f"{len(CASES) - failed}/{len(CASES)} passed")
    return 1 if failed else 0


def test_cases():
    assert run() == 0


if __name__ == "__main__":
    raise SystemExit(run())
