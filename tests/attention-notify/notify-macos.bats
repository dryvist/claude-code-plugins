#!/usr/bin/env bats
# Test suite for attention-notify/scripts/notify-macos.sh
#
# Fake `uname`, `terminal-notifier` and `osascript` on PATH log their argv, so
# the tests cover banner content, the session-name sources, quoting safety,
# the osascript fallback, and the non-darwin no-op.
#
# Run with: bats tests/attention-notify/notify-macos.bats

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SCRIPT="$REPO_ROOT/attention-notify/scripts/notify-macos.sh"
  TMP="$(mktemp -d)"
  mkdir -p "$TMP/bin" "$TMP/sessions"
  export LOG="$TMP/log" CLAUDE_CONFIG_DIR="$TMP"
  unset CLAUDE_PID
  printf '#!/bin/sh\necho "${FAKE_OS:-Darwin}"\n' > "$TMP/bin/uname"
  printf '#!/bin/sh\nfor a in "$@"; do printf "%%s\\n" "$a"; done > "$LOG"\n' > "$TMP/bin/terminal-notifier"
  chmod +x "$TMP/bin/uname" "$TMP/bin/terminal-notifier"
  cp "$TMP/bin/terminal-notifier" "$TMP/bin/osascript"
  export PATH="$TMP/bin:$PATH"
}

teardown() { rm -rf "$TMP"; }

@test "PushNotification hook: body, cwd + short id fallback, Ghostty activation" {
  run "$SCRIPT" <<<'{"session_id":"0123456789abcdef","cwd":"/x/my-repo","tool_name":"PushNotification","tool_input":{"message":"Tap the key — signing"}}'
  [ "$status" -eq 0 ]
  grep -qxF 'claude · my-repo 01234567' "$LOG"
  grep -qxF 'Tap the key — signing' "$LOG"
  grep -qxF 'com.mitchellh.ghostty' "$LOG"
}

@test "Notification hook: session name from the sessions file matching session_id" {
  printf '{"sessionId":"other","name":"wrong"}' > "$TMP/sessions/1.json"
  printf '{"sessionId":"abc","name":"my-session"}' > "$TMP/sessions/2.json"
  run "$SCRIPT" <<<'{"session_id":"abc","cwd":"/r","message":"Claude needs your permission"}'
  [ "$status" -eq 0 ]
  grep -qxF 'claude · my-session' "$LOG"
  grep -qxF 'Claude needs your permission' "$LOG"
}

@test "direct call: CLAUDE_PID selects the sessions file" {
  printf '{"sessionId":"abc","name":"pid-session"}' > "$TMP/sessions/42.json"
  CLAUDE_PID=42 run "$SCRIPT" "Approve the deploy — prod gate"
  [ "$status" -eq 0 ]
  grep -qxF 'claude · pid-session' "$LOG"
  grep -qxF 'Approve the deploy — prod gate' "$LOG"
}

@test "osascript fallback passes quotes as argv" {
  rm "$TMP/bin/terminal-notifier"
  run "$SCRIPT" <<<'{"session_id":"abc","cwd":"/r","message":"say \"hi\" & '\''bye'\''"}'
  [ "$status" -eq 0 ]
  grep -qxF "say \"hi\" & 'bye'" "$LOG"
}

@test "non-darwin is a silent no-op" {
  FAKE_OS=Linux run "$SCRIPT" "x"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ ! -e "$LOG" ]
}
