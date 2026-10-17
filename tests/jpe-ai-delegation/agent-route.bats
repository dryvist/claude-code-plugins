#!/usr/bin/env bats

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  PATH="$REPO_ROOT/jpe-ai-delegation/scripts:$PATH"
  export PATH
}

assert_route() {
  local expected=$1
  local codex_quota=$2
  local kind=$3
  shift 3

  run env AGENT_ROUTE_CODEX_QUOTA="$codex_quota" agent-route "$kind" "$@"
  [ "$status" -eq 0 ]
  [ "$output" = "$expected" ]
}

@test "Codex exhaustion with ZCode exhausted follows each kind's fallback" {
  assert_route 'OpenCode Go' exhausted code-review --zcode exhausted
  assert_route 'Haiku high' exhausted triage --zcode exhausted
  assert_route 'OpenCode Go' exhausted private --zcode exhausted
}

@test "Codex availability selects Codex for each kind when ZCode is exhausted" {
  assert_route 'Codex' available code-review --zcode exhausted
  assert_route 'Codex' available triage --zcode exhausted
  assert_route 'Codex' available private --zcode exhausted
}

@test "ZCode availability selects its rung only for public kinds" {
  assert_route 'ZCode' exhausted code-review --zcode available
  assert_route 'ZCode Flash' exhausted triage --zcode available
  assert_route 'OpenCode Go' exhausted private --zcode available
}

@test "ZCode availability defaults to exhausted" {
  assert_route 'Haiku high' exhausted triage
}

@test "without an override the command uses codex-quota's exit status" {
  mkdir -p "$BATS_TEST_TMPDIR/bin"
  cat > "$BATS_TEST_TMPDIR/bin/codex-quota" <<'EOF'
#!/usr/bin/env bash
exit "$CODEX_QUOTA_EXIT"
EOF
  chmod +x "$BATS_TEST_TMPDIR/bin/codex-quota"

  run env -u AGENT_ROUTE_CODEX_QUOTA CODEX_QUOTA_EXIT=0 PATH="$BATS_TEST_TMPDIR/bin:$PATH" agent-route code-review --zcode exhausted
  [ "$status" -eq 0 ]
  [ "$output" = 'Codex' ]

  run env -u AGENT_ROUTE_CODEX_QUOTA CODEX_QUOTA_EXIT=1 PATH="$BATS_TEST_TMPDIR/bin:$PATH" agent-route code-review --zcode exhausted
  [ "$status" -eq 0 ]
  [ "$output" = 'OpenCode Go' ]
}

@test "unknown kinds exit 2 with one line" {
  run env AGENT_ROUTE_CODEX_QUOTA=available agent-route unknown

  [ "$status" -eq 2 ]
  [ "$output" = 'agent-route: unknown kind: unknown' ]
  [[ "$output" != *$'\n'* ]]
}
