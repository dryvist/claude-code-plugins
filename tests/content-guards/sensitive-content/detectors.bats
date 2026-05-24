#!/usr/bin/env bats
# Per-detector cases for validate-sensitive-content.py: ipv6, email,
# absolute_user_path, private_key_header, aws_account_id, real_domain,
# and cross-detector state isolation.
#
# Run with: bats tests/content-guards/sensitive-content/detectors.bats

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/content-guards/scripts/validate-sensitive-content.py"
  STATE_FILE="$(mktemp)"
  rm -f "$STATE_FILE"
  export SENSITIVE_CONTENT_STATE_FILE="$STATE_FILE"
}

teardown() { rm -f "$STATE_FILE"; }

run_hook() { run python3 "$SCRIPT" <<< "$1"; }

# --- ipv6 -------------------------------------------------------------------

@test "ipv6 allow: ::1 loopback" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"h=\"::1\""}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "ipv6 allow: 2001:db8:: documentation prefix" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"a=\"2001:db8::1\""}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "ipv6 allow: fe80:: link-local" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"a=\"fe80::1234\""}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "ipv6 block: 2620:0:860::1 (real cloudflare-ish)" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"a=\"2620:0:860::1\""}}'
  echo "$output" | grep -q '"permissionDecision": "deny"'
  echo "$output" | grep -q 'ipv6'
}

@test "ipv6 skip: cas-sha256 hash not matched" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.json","content":"cas-sha256:abcd:1234:5678:beef"}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "ipv6 first-block-second-allow" {
  IN='{"tool_name":"Write","tool_input":{"file_path":"/i6s.py","content":"a=\"2620:0:860::1\""}}'
  run python3 "$SCRIPT" <<< "$IN"
  echo "$output" | grep -q '"permissionDecision": "deny"'
  run python3 "$SCRIPT" <<< "$IN"
  echo "$output" | grep -q '"permissionDecision": "allow"'
}

# --- email ------------------------------------------------------------------

@test "email allow: noreply@github.com" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"a=\"noreply@github.com\""}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "email allow: foo@users.noreply.github.com" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"e=\"foo@users.noreply.github.com\""}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "email allow: bar@example.com" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"e=\"bar@example.com\""}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "email allow: placeholder shape <user@host>" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.md","content":"contact <user@host.com>"}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "email block: real alice@realdomain.io" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"e=\"alice@realdomain.io\""}}'
  echo "$output" | grep -q '"permissionDecision": "deny"'
  echo "$output" | grep -q 'email'
}

@test "email first-block-second-allow" {
  IN='{"tool_name":"Write","tool_input":{"file_path":"/es.py","content":"e=\"bob@realcompany.io\""}}'
  run python3 "$SCRIPT" <<< "$IN"
  echo "$output" | grep -q '"permissionDecision": "deny"'
  run python3 "$SCRIPT" <<< "$IN"
  echo "$output" | grep -q '"permissionDecision": "allow"'
}

# --- absolute_user_path -----------------------------------------------------

@test "user_path allow: <user> placeholder" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.md","content":"cd /Users/<user>/p"}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "user_path allow: \\$USER var" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.sh","content":"cd /home/$USER/w"}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "user_path block: hard-coded /Users/alice/" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.md","content":"cd /Users/alice/p"}}'
  echo "$output" | grep -q '"permissionDecision": "deny"'
  echo "$output" | grep -q 'absolute_user_path'
}

@test "user_path first-block-second-allow" {
  IN='{"tool_name":"Write","tool_input":{"file_path":"/ps.md","content":"cd /Users/carol/p"}}'
  run python3 "$SCRIPT" <<< "$IN"
  echo "$output" | grep -q '"permissionDecision": "deny"'
  run python3 "$SCRIPT" <<< "$IN"
  echo "$output" | grep -q '"permissionDecision": "allow"'
}

# --- private_key_header -----------------------------------------------------

@test "private_key block: BEGIN RSA PRIVATE KEY" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.pem","content":"-----BEGIN RSA PRIVATE KEY-----"}}'
  echo "$output" | grep -q '"permissionDecision": "deny"'
  echo "$output" | grep -q 'private_key_header'
}

@test "private_key block: bare BEGIN PRIVATE KEY (PKCS8)" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.pem","content":"-----BEGIN PRIVATE KEY-----"}}'
  echo "$output" | grep -q '"permissionDecision": "deny"'
}

@test "private_key allow: no header literal text" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.md","content":"do not commit private keys"}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "private_key first-block-second-allow" {
  IN='{"tool_name":"Write","tool_input":{"file_path":"/ks.pem","content":"-----BEGIN OPENSSH PRIVATE KEY-----"}}'
  run python3 "$SCRIPT" <<< "$IN"
  echo "$output" | grep -q '"permissionDecision": "deny"'
  run python3 "$SCRIPT" <<< "$IN"
  echo "$output" | grep -q '"permissionDecision": "allow"'
}

# --- aws_account_id ---------------------------------------------------------

@test "aws allow: 123456789012 sample" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.tf","content":"account_id = \"123456789012\""}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "aws allow: 12-digit with no AWS context" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.txt","content":"phone: 555123456789"}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "aws block: 987654321098 with account_id" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.tf","content":"account_id = \"987654321098\""}}'
  echo "$output" | grep -q '"permissionDecision": "deny"'
  echo "$output" | grep -q 'aws_account_id'
}

@test "aws block: ARN with real account id" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.tf","content":"arn:aws:iam::246813579246:role/x"}}'
  echo "$output" | grep -q '"permissionDecision": "deny"'
}

@test "aws first-block-second-allow" {
  IN='{"tool_name":"Write","tool_input":{"file_path":"/as.tf","content":"aws_account_id = 555444333222"}}'
  run python3 "$SCRIPT" <<< "$IN"
  echo "$output" | grep -q '"permissionDecision": "deny"'
  run python3 "$SCRIPT" <<< "$IN"
  echo "$output" | grep -q '"permissionDecision": "allow"'
}

# --- real_domain ------------------------------------------------------------

@test "domain allow: example.com" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"u=\"https://example.com/a\""}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "domain allow: github.com (allowlist)" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"u=\"https://github.com/f/b\""}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "domain allow: docs.jacobpevans.com" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.md","content":"see https://docs.jacobpevans.com/f"}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "domain allow: db.foo.test" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"h=\"db.foo.test\""}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "domain allow: filename foo.md is not a domain" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"p=\"docs/foo.md\""}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "domain allow: repo: line skipped" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.yaml","content":"repo: https://realdomain.io/f"}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "domain allow: image: line skipped" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.yaml","content":"image: docker.io/library/nginx:1.25"}}'
  [ "$status" -eq 0 ] && [ -z "$output" ]
}

@test "domain block: realbusiness.io" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x.py","content":"u=\"https://realbusiness.io/a\""}}'
  echo "$output" | grep -q '"permissionDecision": "deny"'
  echo "$output" | grep -q 'real_domain'
}

@test "domain first-block-second-allow" {
  IN='{"tool_name":"Write","tool_input":{"file_path":"/ds.py","content":"u=\"https://realbusiness.io\""}}'
  run python3 "$SCRIPT" <<< "$IN"
  echo "$output" | grep -q '"permissionDecision": "deny"'
  run python3 "$SCRIPT" <<< "$IN"
  echo "$output" | grep -q '"permissionDecision": "allow"'
}

# --- state-key isolation ----------------------------------------------------

@test "state isolation: acknowledged IPv4 does not pre-allow new email" {
  F='{"tool_name":"Write","tool_input":{"file_path":"/mix.py","content":"x=\"10.0.1.200\""}}'
  S='{"tool_name":"Write","tool_input":{"file_path":"/mix.py","content":"x=\"10.0.1.200\"\ne=\"al@realdom.io\""}}'
  run python3 "$SCRIPT" <<< "$F"
  echo "$output" | grep -q '"permissionDecision": "deny"'
  run python3 "$SCRIPT" <<< "$S"
  echo "$output" | grep -q '"permissionDecision": "deny"'
  echo "$output" | grep -q 'email'
  echo "$output" | grep -q 'al@realdom.io'
}
