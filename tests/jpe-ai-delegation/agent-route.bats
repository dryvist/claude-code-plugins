#!/usr/bin/env bats

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  PATH="$REPO_ROOT/jpe-ai-delegation/scripts:$PATH"
  export PATH
  unset AGENT_ROUTE_CODEX_QUOTA AGENT_ROUTE_GLM_MODEL AGENT_ROUTE_OPENCODE_GO_MODEL
  unset AGENT_ROUTE_TASK AGENT_ROUTE_REPO_AI_UNTRUSTED_OK AGENT_ROUTE_PAYLOAD_CLASSIFICATION
  unset LLM_ROUTER_URL LLM_ROUTER_TOKEN_FILE LITELLM_LOCAL_BASE_URL
  export AGENT_ROUTE_ZCODE_AVAILABLE=no
}

assert_route() {
  local expected=$1
  local codex_quota=$2
  local kind=$3
  shift 3
  run env AGENT_ROUTE_CODEX_QUOTA="$codex_quota" "$@" agent-route "$kind"
  [ "$status" -eq 0 ]
  [ "$output" = "$expected" ]
}

@test "Codex availability selects Codex before every lower rung" {
  for kind in code private other; do
    assert_route Codex available "$kind" AGENT_ROUTE_ZCODE_AVAILABLE=yes AGENT_ROUTE_GLM_MODEL=glm AGENT_ROUTE_OPENCODE_GO_MODEL=go LITELLM_LOCAL_BASE_URL=http://localhost
  done
}

@test "capped public coding selects an available sandbox before GLM" {
  assert_route 'zcode-job sandbox' exhausted code AGENT_ROUTE_ZCODE_AVAILABLE=yes AGENT_ROUTE_GLM_MODEL=glm LITELLM_LOCAL_BASE_URL=http://localhost
}

@test "private sandbox requires coding, property true, and safe payload classification" {
  assert_route 'zcode-job sandbox' exhausted private AGENT_ROUTE_ZCODE_AVAILABLE=yes AGENT_ROUTE_TASK=code AGENT_ROUTE_REPO_AI_UNTRUSTED_OK=true AGENT_ROUTE_PAYLOAD_CLASSIFICATION=safe
  assert_route 'Haiku xhigh' exhausted private AGENT_ROUTE_ZCODE_AVAILABLE=yes AGENT_ROUTE_REPO_AI_UNTRUSTED_OK=true AGENT_ROUTE_PAYLOAD_CLASSIFICATION=safe
  assert_route 'Haiku xhigh' exhausted private AGENT_ROUTE_ZCODE_AVAILABLE=yes AGENT_ROUTE_TASK=code AGENT_ROUTE_PAYLOAD_CLASSIFICATION=safe
  assert_route 'Haiku xhigh' exhausted private AGENT_ROUTE_ZCODE_AVAILABLE=yes AGENT_ROUTE_TASK=code AGENT_ROUTE_REPO_AI_UNTRUSTED_OK=true
  assert_route 'Haiku xhigh' exhausted private AGENT_ROUTE_ZCODE_AVAILABLE=yes AGENT_ROUTE_TASK=code AGENT_ROUTE_REPO_AI_UNTRUSTED_OK=false AGENT_ROUTE_PAYLOAD_CLASSIFICATION=safe
  assert_route 'Haiku xhigh' exhausted private AGENT_ROUTE_ZCODE_AVAILABLE=yes AGENT_ROUTE_TASK=code AGENT_ROUTE_REPO_AI_UNTRUSTED_OK=true AGENT_ROUTE_PAYLOAD_CLASSIFICATION=unsafe
}

@test "read-only and other work never selects zcode, including with private gates" {
  assert_route 'Haiku xhigh' exhausted other AGENT_ROUTE_ZCODE_AVAILABLE=yes AGENT_ROUTE_TASK=code AGENT_ROUTE_REPO_AI_UNTRUSTED_OK=true AGENT_ROUTE_PAYLOAD_CLASSIFICATION=safe
  run jq -e '[.kinds.other.rungs[].name] | any(test("sandbox"))' "$REPO_ROOT/jpe-ai-delegation/skills/delegation-ladder/ladder.json"
  [ "$status" -eq 1 ]
}

@test "GLM then OpenCode Go are eligible for every kind while capped" {
  for kind in code private other; do
    assert_route 'Z.ai GLM' exhausted "$kind" AGENT_ROUTE_GLM_MODEL=glm AGENT_ROUTE_OPENCODE_GO_MODEL=go LITELLM_LOCAL_BASE_URL=http://localhost
    assert_route 'OpenCode Go' exhausted "$kind" AGENT_ROUTE_OPENCODE_GO_MODEL=go LITELLM_LOCAL_BASE_URL=http://localhost
  done
}

@test "unconfigured gateways do not qualify, leaving Haiku xhigh last" {
  for kind in code private other; do
    assert_route 'Haiku xhigh' exhausted "$kind"
    assert_route 'Haiku xhigh' exhausted "$kind" AGENT_ROUTE_GLM_MODEL=glm AGENT_ROUTE_OPENCODE_GO_MODEL=go
  done
}

@test "sandbox availability is detected natively when not overridden" {
  mkdir -p "$BATS_TEST_TMPDIR/bin"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$BATS_TEST_TMPDIR/bin/zcode-job"
  chmod +x "$BATS_TEST_TMPDIR/bin/zcode-job"
  run env -u AGENT_ROUTE_ZCODE_AVAILABLE AGENT_ROUTE_CODEX_QUOTA=exhausted PATH="$BATS_TEST_TMPDIR/bin:$PATH" agent-route code
  [ "$status" -eq 0 ]
  [ "$output" = 'zcode-job sandbox' ]
}

@test "the command checks codex-quota before fallback eligibility" {
  mkdir -p "$BATS_TEST_TMPDIR/bin"
  cat > "$BATS_TEST_TMPDIR/bin/codex-quota" <<'STUB'
#!/usr/bin/env bash
exit "$CODEX_QUOTA_EXIT"
STUB
  chmod +x "$BATS_TEST_TMPDIR/bin/codex-quota"
  run env -u AGENT_ROUTE_CODEX_QUOTA CODEX_QUOTA_EXIT=0 PATH="$BATS_TEST_TMPDIR/bin:$PATH" agent-route code
  [ "$status" -eq 0 ]
  [ "$output" = Codex ]
  run env -u AGENT_ROUTE_CODEX_QUOTA CODEX_QUOTA_EXIT=1 AGENT_ROUTE_ZCODE_AVAILABLE=yes PATH="$BATS_TEST_TMPDIR/bin:$PATH" agent-route code
  [ "$status" -eq 0 ]
  [ "$output" = 'zcode-job sandbox' ]
  run env -u AGENT_ROUTE_CODEX_QUOTA CODEX_QUOTA_EXIT=127 PATH="$BATS_TEST_TMPDIR/bin:$PATH" agent-route code
  [ "$status" -eq 1 ]
  [ "$output" = 'agent-route: Codex quota status unavailable' ]
}

@test "unknown kinds, flags and quota overrides are rejected" {
  run agent-route unknown
  [ "$status" -eq 2 ]
  [ "$output" = 'agent-route: unknown kind: unknown' ]
  run agent-route code --zcode available
  [ "$status" -eq 2 ]
  [ "$output" = 'agent-route: usage: agent-route <code|private|other>' ]
  run env AGENT_ROUTE_CODEX_QUOTA=maybe agent-route code
  [ "$status" -eq 2 ]
}
