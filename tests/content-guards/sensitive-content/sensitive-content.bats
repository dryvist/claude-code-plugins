#!/usr/bin/env bats
# Test suite for content-guards/scripts/validate-sensitive-content.py
# IPv4 detector + tool filtering + state machine (regression preservation
# from the original no-real-ips hook). Per-detector cases for ipv6, email,
# absolute_user_path, private_key_header, aws_account_id, real_domain live
# in detectors.bats in the same directory.
#
# Run with: bats tests/content-guards/sensitive-content/sensitive-content.bats

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/content-guards/scripts/validate-sensitive-content.py"
  STATE_FILE="$(mktemp)"
  rm -f "$STATE_FILE"
  export SENSITIVE_CONTENT_STATE_FILE="$STATE_FILE"

  if [[ ! -f "$SCRIPT" ]]; then
    echo "ERROR: Script not found at $SCRIPT" >&2
    return 1
  fi
}

teardown() {
  rm -f "$STATE_FILE"
}

run_hook() {
  run python3 "$SCRIPT" <<< "$1"
}

# ---------------------------------------------------------------------------
# TC1: Non Write/Edit tools are silently allowed (exit 0, no output)
# ---------------------------------------------------------------------------

@test "TC1: Bash tool is allowed silently" {
  run_hook '{"tool_name":"Bash","tool_input":{"command":"echo 10.0.1.200"}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "TC1b: Read tool is allowed silently" {
  run_hook '{"tool_name":"Read","tool_input":{"file_path":"/x"}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "TC1c: invalid JSON is allowed silently (fail-open)" {
  run python3 "$SCRIPT" <<< "not json"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

# ---------------------------------------------------------------------------
# TC2: IPv4 allowlist — every sanctioned range passes
# ---------------------------------------------------------------------------

@test "TC2a: 192.168.0.x sample range allowed" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"url=\"192.168.0.200\""}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "TC2b: loopback 127.0.0.1 allowed" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"host=\"127.0.0.1\""}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "TC2c: 0.0.0.0 wildcard allowed" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.yml","content":"bind: 0.0.0.0"}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "TC2d: 169.254.169.254 metadata allowed" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.sh","content":"curl 169.254.169.254/latest"}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "TC2e: version pin rev: v0.10.0.1 is skipped" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.yml","content":"rev: v0.10.0.1"}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "TC2f: 192.168.1.x (not 192.168.0.x) is BLOCKED" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"x=\"192.168.1.50\""}}'
  echo "$output" | grep -q '"permissionDecision": "deny"'
  echo "$output" | grep -q 'ipv4'
}

# ---------------------------------------------------------------------------
# TC3-TC4: First-block / second-allow flow
# ---------------------------------------------------------------------------

@test "TC3a: Write with 10.0.1.200 blocked on first attempt" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/repo/tests/test.py","content":"url=\"10.0.1.200\""}}'
  echo "$output" | grep -q '"permissionDecision": "deny"'
  echo "$output" | grep -q 'BLOCKED (first attempt)'
  echo "$output" | grep -q '10.0.1.200'
}

@test "TC3b: Edit with new_string containing 172.16.0.5 blocked" {
  run_hook '{"tool_name":"Edit","tool_input":{"file_path":"/x.yml","old_string":"o","new_string":"host: 172.16.0.5"}}'
  echo "$output" | grep -q '"permissionDecision": "deny"'
  echo "$output" | grep -q '172.16.0.5'
}

@test "TC4a: same file + same IP retried allows" {
  IN='{"tool_name":"Write","tool_input":{"file_path":"/repo/scratch.py","content":"x=\"10.0.1.200\""}}'
  run python3 "$SCRIPT" <<< "$IN"
  echo "$output" | grep -q '"permissionDecision": "deny"'
  run python3 "$SCRIPT" <<< "$IN"
  echo "$output" | grep -q '"permissionDecision": "allow"'
  echo "$output" | grep -q 'WARNING (acknowledged)'
}

@test "TC4b: same IP in a different file blocks again" {
  F='{"tool_name":"Write","tool_input":{"file_path":"/a.py","content":"x=\"10.0.1.200\""}}'
  S='{"tool_name":"Write","tool_input":{"file_path":"/b.py","content":"x=\"10.0.1.200\""}}'
  run python3 "$SCRIPT" <<< "$F"
  echo "$output" | grep -q '"permissionDecision": "deny"'
  run python3 "$SCRIPT" <<< "$S"
  echo "$output" | grep -q '"permissionDecision": "deny"'
}

@test "TC4c: same file, NEW IP on second write blocks the new one" {
  F='{"tool_name":"Write","tool_input":{"file_path":"/c.py","content":"x=\"10.0.1.200\""}}'
  S='{"tool_name":"Write","tool_input":{"file_path":"/c.py","content":"y=\"172.16.0.5\""}}'
  run python3 "$SCRIPT" <<< "$F"
  echo "$output" | grep -q '"permissionDecision": "deny"'
  run python3 "$SCRIPT" <<< "$S"
  echo "$output" | grep -q '"permissionDecision": "deny"'
  echo "$output" | grep -q '172.16.0.5'
}

@test "TC4d: same file, retry with both old (ack) + new IP blocks only new" {
  F='{"tool_name":"Write","tool_input":{"file_path":"/d.py","content":"x=\"10.0.1.200\""}}'
  S='{"tool_name":"Write","tool_input":{"file_path":"/d.py","content":"a=\"10.0.1.200\"\nb=\"172.16.0.5\""}}'
  run python3 "$SCRIPT" <<< "$F"
  echo "$output" | grep -q '"permissionDecision": "deny"'
  run python3 "$SCRIPT" <<< "$S"
  echo "$output" | grep -q '"permissionDecision": "deny"'
  echo "$output" | grep -q '172.16.0.5'
  echo "$output" | grep -vq 'BLOCKED.*10\.0\.1\.200,'
}

# ---------------------------------------------------------------------------
# TC5-TC6: Edge cases — empty content, strict octet regex
# ---------------------------------------------------------------------------

@test "TC5: Write with no content is allowed silently" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":""}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "TC6a: 999.999.999.999 is not matched (each octet > 255)" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"x=\"999.999.999.999\""}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "TC6b: 256.1.1.1 is not matched (first octet > 255)" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"x=\"256.1.1.1\""}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "TC6c: 192.168.0.256 is not matched (last octet > 255)" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"x=\"192.168.0.256\""}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

# ---------------------------------------------------------------------------
# TC7: Path normalization
# ---------------------------------------------------------------------------

@test "TC7: relative and absolute paths to the same file share state" {
  T="$(mktemp -d)"
  ABS="$T/foo.py"
  REL="./foo.py"
  F="{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$ABS\",\"content\":\"x=\\\"10.0.1.200\\\"\"}}"
  S="{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$REL\",\"content\":\"x=\\\"10.0.1.200\\\"\"}}"
  run python3 "$SCRIPT" <<< "$F"
  echo "$output" | grep -q '"permissionDecision": "deny"'
  cd "$T"
  run python3 "$SCRIPT" <<< "$S"
  echo "$output" | grep -q '"permissionDecision": "allow"'
  rm -rf "$T"
}
