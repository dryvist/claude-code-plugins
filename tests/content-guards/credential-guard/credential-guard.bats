#!/usr/bin/env bats
# Test suite for content-guards/scripts/credential-guard.py (hook protocol only;
# the detection cases live in scripts/test_credential_guard.py).
#
# Run with: bats tests/content-guards/credential-guard/credential-guard.bats

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/content-guards/scripts/credential-guard.py"
}

run_hook() {
  run python3 "$SCRIPT" <<< "$1"
}

@test "clean write is allowed with no output" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x/git/private/a.md","content":"hello"}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "secret redirect is denied with the PreToolUse deny JSON" {
  run_hook '{"tool_name":"Bash","tool_input":{"command":"echo \"$API_TOKEN\" > out.txt"}}'
  [ "$status" -eq 0 ]
  [[ "$output" == *'"permissionDecision": "deny"'* ]]
}

@test "literal password warns without denying" {
  run_hook '{"tool_name":"Write","tool_input":{"file_path":"/x/a.md","content":"password = \"hunter2hunter2\""}}'
  [ "$status" -eq 0 ]
  [[ "$output" == *systemMessage* ]]
  [[ "$output" != *deny* ]]
}

@test "malformed input fails open" {
  run_hook 'not json'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
