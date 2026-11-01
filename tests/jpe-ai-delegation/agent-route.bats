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

@test "Codex exhaustion follows each kind's fallback" {
  assert_route 'zcode-job sandbox' exhausted code
  assert_route 'Haiku xhigh' exhausted private
  assert_route 'Haiku xhigh' exhausted other
}

@test "private repos never reach the sandbox, even with the allowlist gate set" {
  run env AGENT_ROUTE_CODEX_QUOTA=exhausted AGENT_ROUTE_SANDBOX_ALLOWLISTED=yes agent-route private
  [ "$status" -eq 0 ]
  [ "$output" = 'Haiku xhigh' ]
}

@test "Codex availability selects Codex for every kind" {
  assert_route 'Codex' available code
  assert_route 'Codex' available other
  assert_route 'Codex' available private
}

@test "the sandbox rung is absent from the other kind and the zcode flag is rejected" {
  run jq -e '[.kinds.other.rungs[].name] | any(test("sandbox"))' "$REPO_ROOT/jpe-ai-delegation/skills/delegation-ladder/ladder.json"
  [ "$status" -eq 1 ]

  run env AGENT_ROUTE_CODEX_QUOTA=exhausted agent-route code --zcode available
  [ "$status" -eq 2 ]
  [ "$output" = 'agent-route: usage: agent-route <code|private|other>' ]
}

@test "no ladder names Sonnet, Opus or a GLM rung" {
  run grep -riE 'sonnet|opus|glm' "$REPO_ROOT/jpe-ai-delegation/skills/delegation-ladder/ladder.json"
  [ "$status" -eq 1 ]
}

@test "without an override the command uses codex-quota's exit status" {
  mkdir -p "$BATS_TEST_TMPDIR/bin"
  cat > "$BATS_TEST_TMPDIR/bin/codex-quota" <<'EOF'
#!/usr/bin/env bash
exit "$CODEX_QUOTA_EXIT"
EOF
  chmod +x "$BATS_TEST_TMPDIR/bin/codex-quota"

  run env -u AGENT_ROUTE_CODEX_QUOTA CODEX_QUOTA_EXIT=0 PATH="$BATS_TEST_TMPDIR/bin:$PATH" agent-route code
  [ "$status" -eq 0 ]
  [ "$output" = 'Codex' ]

  run env -u AGENT_ROUTE_CODEX_QUOTA CODEX_QUOTA_EXIT=1 PATH="$BATS_TEST_TMPDIR/bin:$PATH" agent-route code
  [ "$status" -eq 0 ]
  [ "$output" = 'zcode-job sandbox' ]
}

@test "unknown kinds exit 2 with one line" {
  run env AGENT_ROUTE_CODEX_QUOTA=available agent-route unknown

  [ "$status" -eq 2 ]
  [ "$output" = 'agent-route: unknown kind: unknown' ]
  [[ "$output" != *$'\n'* ]]
}
