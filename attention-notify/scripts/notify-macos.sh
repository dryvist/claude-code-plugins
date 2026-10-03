#!/usr/bin/env bash
# Raise one local macOS banner: title "claude · <session name>", body = message.
#
#   notify-macos.sh "<what to do — why>" [session-id]   # direct call
#   notify-macos.sh < hook-input.json                   # Claude Code hook
#
# Hook mode reads .tool_input.message (PushNotification) or .message
# (Notification event) plus .session_id and .cwd from stdin.
#
# Session name: .name from ~/.claude/sessions/<CLAUDE_PID>.json, else from the
# sessions file whose sessionId matches, else "<cwd basename> <short id>".
# Clicking focuses Ghostty when terminal-notifier is on PATH; otherwise
# osascript shows a plain banner. Non-darwin hosts and every failure exit 0.
set -u

[ "$(uname -s)" = Darwin ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

cwd="$PWD"
if [ $# -gt 0 ]; then
  msg="$1"
  sid="${2:-}"
else
  input="$(cat)"
  field() { jq -r "$1 // empty" <<<"$input" 2>/dev/null; }
  msg="$(field '.tool_input.message // .message')"
  sid="$(field '.session_id')"
  cwd="$(field '.cwd')"
  cwd="${cwd:-$PWD}"
fi
[ -n "$msg" ] || exit 0

# Only .name and .sessionId are read from the sessions files.
sessions="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sessions"
session=""
if [ -n "${CLAUDE_PID:-}" ] && [ -r "$sessions/$CLAUDE_PID.json" ]; then
  session="$(jq -r '.name // empty' "$sessions/$CLAUDE_PID.json" 2>/dev/null)"
fi
if [ -z "$session" ] && [ -n "$sid" ]; then
  session="$(jq -r --arg s "$sid" 'select(.sessionId == $s) | .name // empty' "$sessions"/*.json 2>/dev/null | head -n 1)"
fi
[ -n "$session" ] || session="$(basename "$cwd")${sid:+ ${sid:0:8}}"
title="claude · $session"

if command -v terminal-notifier >/dev/null 2>&1; then
  terminal-notifier -title "$title" -message "$msg" -sound Ping \
    -activate com.mitchellh.ghostty -group "${sid:-$session}" >/dev/null 2>&1
else
  # Message and title travel as argv, never interpolated into the script.
  osascript -e 'on run argv' \
    -e 'display notification (item 1 of argv) with title (item 2 of argv) sound name "Ping"' \
    -e 'end run' "$msg" "$title" >/dev/null 2>&1
fi
exit 0
