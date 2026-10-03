# attention-notify

Raises a local macOS banner every time a Claude Code session needs the operator,
whether or not the terminal has focus.

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/attention-notify
```

Optional, for click-to-focus: `terminal-notifier` on `PATH`.

## Events

| Hook | Matcher | Message source |
|------|---------|----------------|
| `PostToolUse` | `PushNotification` | `tool_input.message` |
| `Notification` | `permission_prompt\|elicitation_dialog\|elicitation_url_dialog` | `message` |

Each event raises one banner: the `Notification` matcher covers only permission
and question prompts, and PushNotification calls go through the `PostToolUse` hook alone.

## Banner

- **Title**: `claude · <session name>`. The name comes from `.name` in
  `~/.claude/sessions/<CLAUDE_PID>.json`, else from the sessions file whose
  `sessionId` matches the hook's `session_id`, else `<cwd basename> <first 8 of session id>`.
  No other field of those files is read.
- **Body**: the notification message.
- **Click**: focuses Ghostty when `terminal-notifier` is on `PATH`; otherwise
  `osascript` shows a plain banner.

## Usage

The hooks need no setup. Other tools can raise the same banner:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/notify-macos.sh" "Tap the YubiKey — signing the release" [session-id]
```

## Behavior

- macOS only; a silent no-op elsewhere.
- Always exits 0, so it never blocks or fails a tool call.
- The message and title reach `osascript` as `argv`, never interpolated into the script.

## Testing

```bash
bats tests/attention-notify/notify-macos.bats
```
