#!/usr/bin/env python3
"""Tests for leakage-guard.py detect_leaks() — the pure detection core.

Run: python3 content-guards/scripts/test_leakage_guard.py
The visibility gate (_is_public_repo) is I/O and fail-open; it is not unit-tested
here — detect_leaks is the security-relevant logic.
"""

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).parent / "leakage-guard.py"
spec = importlib.util.spec_from_file_location("leakage_guard", str(SCRIPT))
lg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lg)

# (label, text, should_flag)
# Detection is scoped to PRIVATE host IPs + VMIDs — the real homelab leak vectors.
# Public IPs and version strings are intentionally NOT flagged (see _is_leak_ip).
CASES = [
    # BLOCKS — bare private host IPs and infra VMIDs.
    ("RFC1918 host IP", "db_host: 192.168.1.47", True),
    ("10.x host IP", "backend = 10.4.2.9", True),
    ("172.16 host IP", "peer 172.20.0.5", True),
    ("VMID assignment", "vmid: 303000", True),
    ("proxmox CT id", "pct exec 605020 -- true", True),
    ("ctid form", "ctid=250", True),
    # BLOCKS — /32 and malformed prefixes are single hosts, not ranges.
    ("private host /32 bypass", "host 192.168.1.47/32", True),
    ("private host malformed /99", "host 10.4.2.9/99", True),
    # PASSES — examples, ranges, and public/non-host forms.
    ("example CIDR 192.168", "network: 192.168.0.0/16", False),
    ("private /24 is a range", "subnet 192.168.1.0/24", False),
    ("CIDR range 10.x", "vpc 10.0.0.0/8", False),
    ("RFC5737 doc IP", "example server 192.0.2.10", False),
    ("loopback", "bind 127.0.0.1", False),
    ("unspecified bind", "listen 0.0.0.0:8080", False),
    ("public resolver example", "dns = 8.8.8.8", False),
    ("public IP not flagged", "endpoint = 203.44.12.9", False),
    ("version string not flagged", "version 1.2.3.4 released", False),
    ("bare integer not vmid", "there are 303000 rows", False),
    ("plain prose", "deploy the app and verify", False),
]

all_pass = True
for label, text, expect in CASES:
    got = bool(lg.detect_leaks(text))
    ok = got == expect
    all_pass &= ok
    status = "PASS" if ok else "FAIL"
    print(f"{status} [{label}]: flagged={got} expected={expect}")
    if not ok:
        print(f"  -> {lg.detect_leaks(text)}")

# Core contract from the plan, asserted explicitly.
assert lg.detect_leaks("192.168.1.47"), "real host IP must flag"
assert not lg.detect_leaks("192.168.0.0/16"), "example CIDR must pass"
assert lg.detect_leaks("192.168.1.47/32"), "/32 must not bypass — it is a host"

# Edit payloads must be scanned: new_string is primary, content is the fallback,
# so no Edit variant slips a leak through unscanned (a security bypass).
assert lg._new_content("Edit", {"new_string": "10.4.2.9"}) == "10.4.2.9"
assert lg._new_content("Edit", {"content": "10.4.2.9"}) == "10.4.2.9"
assert lg._new_content("Write", {"content": "10.4.2.9"}) == "10.4.2.9"

print()
print("ALL TESTS PASSED" if all_pass else "SOME TESTS FAILED")
raise SystemExit(0 if all_pass else 1)
