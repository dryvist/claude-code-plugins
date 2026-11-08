#!/usr/bin/env bats

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  PATH="$REPO_ROOT/jpe-ai-delegation/scripts:$PATH"
  export PATH
  unset AGENT_ROUTE_CODEX_QUOTA AGENT_ROUTE_GLM_MODEL AGENT_ROUTE_OPENCODE_GO_MODEL
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

@test "quota-available Codex takes private and other work" {
  for kind in private other; do
    assert_route Codex available "$kind" AGENT_ROUTE_ZCODE_AVAILABLE=yes AGENT_ROUTE_GLM_MODEL=glm AGENT_ROUTE_OPENCODE_GO_MODEL=go LITELLM_LOCAL_BASE_URL=http://localhost
  done
}

@test "eligible public coding selects the sandbox before Codex and GLM" {
  assert_route 'zcode-job sandbox' available code AGENT_ROUTE_ZCODE_AVAILABLE=yes AGENT_ROUTE_GLM_MODEL=glm LITELLM_LOCAL_BASE_URL=http://localhost
  assert_route 'zcode-job sandbox' exhausted code AGENT_ROUTE_ZCODE_AVAILABLE=yes AGENT_ROUTE_GLM_MODEL=glm LITELLM_LOCAL_BASE_URL=http://localhost
}

@test "private work never selects zcode or the public-only gateways" {
  assert_route 'Haiku xhigh' exhausted private AGENT_ROUTE_ZCODE_AVAILABLE=yes AGENT_ROUTE_GLM_MODEL=glm AGENT_ROUTE_OPENCODE_GO_MODEL=go LITELLM_LOCAL_BASE_URL=http://localhost
  run jq -e '.kinds.private.rungs | any(.gate == "sandbox" or .gate == "glm" or .gate == "opencode-go")' "$REPO_ROOT/jpe-ai-delegation/skills/delegation-ladder/ladder.json"
  [ "$status" -eq 1 ]
}

@test "read-only and other work never selects zcode" {
  assert_route Codex available other AGENT_ROUTE_ZCODE_AVAILABLE=yes
  assert_route 'Haiku xhigh' exhausted other AGENT_ROUTE_ZCODE_AVAILABLE=yes
  run jq -e '[.kinds.other.rungs[].name] | any(test("sandbox"))' "$REPO_ROOT/jpe-ai-delegation/skills/delegation-ladder/ladder.json"
  [ "$status" -eq 1 ]
}

@test "GLM then OpenCode Go are eligible for public kinds while capped" {
  for kind in code other; do
    assert_route 'Z.ai GLM' exhausted "$kind" AGENT_ROUTE_GLM_MODEL=glm AGENT_ROUTE_OPENCODE_GO_MODEL=go LITELLM_LOCAL_BASE_URL=http://localhost
    assert_route 'OpenCode Go' exhausted "$kind" AGENT_ROUTE_OPENCODE_GO_MODEL=go LITELLM_LOCAL_BASE_URL=http://localhost
  done
}

@test "unconfigured gateways do not qualify, leaving Haiku xhigh last" {
  for kind in code private other; do
    assert_route 'Haiku xhigh' exhausted "$kind"
    assert_route 'Haiku xhigh' exhausted "$kind" AGENT_ROUTE_ZCODE_AVAILABLE=no AGENT_ROUTE_GLM_MODEL=glm AGENT_ROUTE_OPENCODE_GO_MODEL=go
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
  run env -u AGENT_ROUTE_ZCODE_AVAILABLE -u AGENT_ROUTE_CODEX_QUOTA CODEX_QUOTA_EXIT=0 PATH="$BATS_TEST_TMPDIR/bin:$PATH" agent-route private
  [ "$status" -eq 0 ]
  [ "$output" = Codex ]
  run env -u AGENT_ROUTE_CODEX_QUOTA CODEX_QUOTA_EXIT=1 AGENT_ROUTE_ZCODE_AVAILABLE=yes PATH="$BATS_TEST_TMPDIR/bin:$PATH" agent-route code
  [ "$status" -eq 0 ]
  [ "$output" = 'zcode-job sandbox' ]
  run env -u AGENT_ROUTE_ZCODE_AVAILABLE -u AGENT_ROUTE_CODEX_QUOTA CODEX_QUOTA_EXIT=127 PATH="$BATS_TEST_TMPDIR/bin:$PATH" agent-route code
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
