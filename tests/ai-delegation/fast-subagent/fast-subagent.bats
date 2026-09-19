#!/usr/bin/env bats
# Test suite for ai-delegation/skills/fast-subagent/scripts/fast-subagent.sh
#
# A fake `curl` on PATH replays canned HTTP status/headers/bodies from
# $FAKE_CURL_SCRIPT (one "status|headers|body" line per call, consumed in
# order), so the tests cover:
#   - no endpoint in the environment → exit 2, nothing sent
#   - 200 → text on stdout, `model=... fallbacks=...` on stderr
#   - 429 with Retry-After, then 200 → one wait, then success
#   - 429 twice → exit 4
#   - 401 → exit 3, no retry
#   - 200 with empty content → exit 7
#   - --release adds the x-subagent-release header
#
# Run with: bats tests/ai-delegation/fast-subagent/fast-subagent.bats

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/ai-delegation/skills/fast-subagent/scripts/fast-subagent.sh"
  [[ -f "$SCRIPT" ]] || { echo "ERROR: Script not found at $SCRIPT" >&2; return 1; }

  TMP="$(mktemp -d)"
  export FAKE_CURL_SCRIPT="$TMP/script" FAKE_CURL_LOG="$TMP/log"
  mkdir -p "$TMP/bin"
  cat > "$TMP/bin/curl" <<'FAKE'
#!/usr/bin/env bash
# Replays the first line of $FAKE_CURL_SCRIPT and drops it; logs argv.
printf '%s\n' "$*" >> "$FAKE_CURL_LOG"
line="$(head -n1 "$FAKE_CURL_SCRIPT")"; tail -n +2 "$FAKE_CURL_SCRIPT" > "$FAKE_CURL_SCRIPT.n"; mv "$FAKE_CURL_SCRIPT.n" "$FAKE_CURL_SCRIPT"
status="${line%%|*}"; rest="${line#*|}"; headers="${rest%%|*}"; body="${rest#*|}"
out=""; hdr=""
while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; -D) hdr="$2"; shift 2;; *) shift;; esac; done
printf 'HTTP/1.1 %s\r\n%b\r\n' "$status" "$headers" > "$hdr"
printf '%s' "$body" > "$out"
printf '%s' "$status"
FAKE
  chmod +x "$TMP/bin/curl"
  export PATH="$TMP/bin:$PATH"

  printf 'test-key\n' > "$TMP/token"
  export LLM_ROUTER_URL="http://router.invalid/v1" LLM_ROUTER_TOKEN_FILE="$TMP/token"
  unset OPENAI_API_BASE_URL LITELLM_LOCAL_KEY OPENAI_API_KEY FAST_SUBAGENT_MODEL
  OK_BODY='{"model":"fast","choices":[{"message":{"content":"PONG"}}]}'
  BUSY_BODY='{"error":{"message":"fast busy: held by codex"}}'
}

teardown() { rm -rf "$TMP"; }

@test "no endpoint in environment → exit 2, curl never called" {
  unset LLM_ROUTER_URL LLM_ROUTER_TOKEN_FILE
  run bash -c 'echo hi | "$1"' _ "$SCRIPT"
  [ "$status" -eq 2 ]
  [ ! -f "$FAKE_CURL_LOG" ]
}

@test "200 → content on stdout, model line on stderr" {
  printf '200|x-litellm-model-name: openai/q\\r\\nx-litellm-attempted-fallbacks: 0|%s\n' "$OK_BODY" > "$FAKE_CURL_SCRIPT"
  run bash -c 'echo hi | "$1" 2>"$2"' _ "$SCRIPT" "$TMP/err"
  [ "$status" -eq 0 ]
  [ "$output" = "PONG" ]
  grep -q '^model=openai/q fallbacks=0$' "$TMP/err"
  grep -q 'Bearer test-key' "$FAKE_CURL_LOG"
  grep -q 'http://router.invalid/v1/chat/completions' "$FAKE_CURL_LOG"
}

@test "200 with empty content → exit 7, nothing on stdout" {
  body='{"model":"openai/q","choices":[{"finish_reason":"length","message":{"role":"assistant","content":""}}]}'
  printf '200|x-litellm-model-name: openai/q|%s\n' "$body" > "$FAKE_CURL_SCRIPT"
  run bash -c 'echo hi | "$1" 2>"$2"' _ "$SCRIPT" "$TMP/err"
  [ "$status" -eq 7 ]
  [ -z "$output" ]
  grep -q 'finish_reason=length' "$TMP/err"
}

@test "429 then 200 → waits Retry-After once, succeeds" {
  printf '429|retry-after: 1|%s\n200|x-litellm-model-name: openai/q|%s\n' "$BUSY_BODY" "$OK_BODY" > "$FAKE_CURL_SCRIPT"
  run bash -c 'echo hi | "$1" 2>"$2"' _ "$SCRIPT" "$TMP/err"
  [ "$status" -eq 0 ]
  [ "$output" = "PONG" ]
  grep -q 'busy (fast busy: held by codex); retrying once in 1s' "$TMP/err"
  [ "$(wc -l < "$FAKE_CURL_LOG")" -eq 2 ]
}

@test "429 twice → exit 4 after exactly two attempts" {
  printf '429|retry-after: 1|%s\n429|retry-after: 1|%s\n' "$BUSY_BODY" "$BUSY_BODY" > "$FAKE_CURL_SCRIPT"
  run bash -c 'echo hi | "$1" 2>"$2"' _ "$SCRIPT" "$TMP/err"
  [ "$status" -eq 4 ]
  [ "$(wc -l < "$FAKE_CURL_LOG")" -eq 2 ]
}

@test "401 → exit 3, no retry" {
  printf '401||{"error":"bad key"}\n' > "$FAKE_CURL_SCRIPT"
  run bash -c 'echo hi | "$1"' _ "$SCRIPT"
  [ "$status" -eq 3 ]
  [ "$(wc -l < "$FAKE_CURL_LOG")" -eq 1 ]
}

@test "--release sends the lock-release header; --model overrides the role" {
  printf '200||%s\n' "$OK_BODY" > "$FAKE_CURL_SCRIPT"
  run bash -c 'echo hi | "$1" --release --model subagent' _ "$SCRIPT"
  [ "$status" -eq 0 ]
  grep -q 'x-subagent-release: 1' "$FAKE_CURL_LOG"
  grep -q '"model":"subagent"' "$FAKE_CURL_LOG"
}
