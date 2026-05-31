#!/usr/bin/env bats
# Test suite for content-guards/scripts/secret-guard.py
#
# All sensitive inputs are FAKE: RFC1918 IP SHAPES with non-homelab octets,
# RFC2544 198.18/198.19 (allowlisted), and example.invalid (allowlisted).
# No real homelab value appears anywhere in this file.
#
# The literal-denylist prong is exercised by pointing the hook at an ABSENT
# keychain service (fail-open) for structural tests. A seeded-keychain literal
# test is covered by the companion test_secret_guard.py, which can clean up its
# own temporary entry; bats keeps to the value-free structural + fail-open path.
#
# Run with: bats tests/content-guards/secret-guard/secret-guard.bats

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/content-guards/scripts/secret-guard.py"

  if [[ ! -f "$SCRIPT" ]]; then
    echo "ERROR: Script not found at $SCRIPT" >&2
    return 1
  fi

  # Point the literal prong at a guaranteed-absent keychain service so the
  # structural prong is what's under test and the literal prong fails open.
  export SENSITIVE_DENYLIST_KEYCHAIN_SERVICE="SENSITIVE_DENYLIST_NONEXISTENT_TEST_SERVICE_ZZZ"
}

run_hook() {
  run python3 "$SCRIPT" <<< "$1"
}

# --- Non-matching tool is silently allowed ----------------------------------

@test "TC1: Bash tool is allowed silently" {
  run_hook '{"tool_name":"Bash","tool_input":{"command":"echo 10.1.2.3"}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

# --- Invalid JSON fails open (allow, exit 0) --------------------------------

@test "TC2: invalid JSON input fails open (exit 0, no deny)" {
  run python3 "$SCRIPT" <<< "not valid json"
  [ "$status" -eq 0 ]
  [[ ! "$output" =~ "deny" ]]
}

# --- Structural RFC1918 IP shapes are denied --------------------------------

@test "TC3: Write with 10.x IP shape is denied" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"x.tf","content":"ip = \"10.20.30.40\""}}'
  [ "$status" -eq 0 ]
  [[ "$output" =~ "deny" ]]
  [[ "$output" =~ "rfc1918" ]]
}

@test "TC4: Write with 192.168.x IP shape is denied" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"x.tf","content":"gw = \"192.168.5.1\""}}'
  [ "$status" -eq 0 ]
  [[ "$output" =~ "deny" ]]
}

@test "TC5: Write with 172.16-31.x IP shape is denied" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"x.tf","content":"h = \"172.20.1.1\""}}'
  [ "$status" -eq 0 ]
  [[ "$output" =~ "deny" ]]
}

# --- Allowlist: fake RFC2544 198.18/198.19 IPs are allowed ------------------

@test "TC6: Write with RFC2544 198.18 IP is allowed silently" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"x.tf","content":"ip = \"198.18.0.10\""}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "TC7: Write with RFC2544 198.19 IP is allowed silently" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"x.tf","content":"ip = \"198.19.5.5\""}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

# --- Structural domain prong is OFF by default (no false positives) ---------

@test "TC8: Write mentioning github.com is allowed (domain prong off by default)" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"x.md","content":"see https://github.com/foo/bar here"}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

# --- Structural domain prong fires only when opted in via env var -----------

@test "TC8b: Write with real-domain shape is denied when prong enabled" {
  SECRET_GUARD_DOMAIN_REGEX='\b[a-z0-9-]+\.(com|net|org)\b' \
    run_hook '{"tool_name":"Write","tool_input":{"file_path":"x.md","content":"see myhost.example.com here"}}'
  [ "$status" -eq 0 ]
  [[ "$output" =~ "deny" ]]
  [[ "$output" =~ "domain" ]]
}

@test "TC9: example.invalid is allowed even when domain prong enabled" {
  SECRET_GUARD_DOMAIN_REGEX='\b[a-z0-9-]+\.(com|net|org)\b' \
    run_hook '{"tool_name":"Write","tool_input":{"file_path":"x.md","content":"see node.example.invalid here"}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

# --- Clean content is allowed -----------------------------------------------

@test "TC10: Write with clean content is allowed silently" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"x.py","content":"def add(a, b):\n    return a + b"}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

# --- Edit / MultiEdit / NotebookEdit content fields are inspected -----------

@test "TC11: Edit new_string with IP shape is denied" {
  run_hook '{"tool_name":"Edit","tool_input":{"file_path":"x.tf","old_string":"a","new_string":"ip = \"10.1.2.3\""}}'
  [ "$status" -eq 0 ]
  [[ "$output" =~ "deny" ]]
}

@test "TC12: MultiEdit edits[].new_string with IP shape is denied" {
  run_hook '{"tool_name":"MultiEdit","tool_input":{"file_path":"x.tf","edits":[{"old_string":"a","new_string":"ip = \"192.168.9.9\""}]}}'
  [ "$status" -eq 0 ]
  [[ "$output" =~ "deny" ]]
}

@test "TC13: NotebookEdit new_source with IP shape is denied" {
  run_hook '{"tool_name":"NotebookEdit","tool_input":{"notebook_path":"x.ipynb","new_source":"h = \"172.18.0.1\""}}'
  [ "$status" -eq 0 ]
  [[ "$output" =~ "deny" ]]
}

@test "TC14: Edit with clean new_string is allowed silently" {
  run_hook '{"tool_name":"Edit","tool_input":{"file_path":"x.tf","old_string":"a","new_string":"value = 42"}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

# --- Deny reason never echoes the matched value -----------------------------

@test "TC15: deny reason names a category, not the matched IP value" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"x.tf","content":"ip = \"10.20.30.40\""}}'
  [ "$status" -eq 0 ]
  [[ "$output" =~ "deny" ]]
  [[ ! "$output" =~ "10.20.30.40" ]]
}
