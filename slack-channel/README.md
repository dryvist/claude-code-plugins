# slack-channel

A two-way Slack channel for one running interactive Claude Code session. Each session
gets its own thread in one private Slack channel. Status lines, questions, tool-permission
prompts and approval links go into that thread, and the operator answers there. Replies
reach the session.

It is a [channel](https://code.claude.com/docs/en/channels) (an MCP server that pushes
events into the session) plus hooks. It ports the official Telegram channel pattern to
Slack Socket Mode.

## What the session does with it

| Event | Where it goes |
|-------|---------------|
| Session start | One root message: session id prefix and working-directory name |
| Operator reply in the thread | Delivered to the session as a channel event |
| `reply` tool | Posted into the thread |
| Tool permission prompt | Posted with `yes <id>` / `no <id>` instructions. The terminal dialog stays open too |
| `AskUserQuestion` | Posted with numbered options. The operator's reply answers the question |
| `Notification` (idle, auth, elicitation, agent) | One status line |
| `Stop` | One status line, the first 500 characters of the last assistant message |
| `PushNotification` | One status line with the message (for example an approval link) |

## Requirements

- [Bun](https://bun.sh) on `PATH`. The server and the hooks run with it.
- A Slack workspace where you can create an app, and a private channel for the session thread.

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/slack-channel
```

Then create the Slack app and channel below.

1. Create a Slack app from this manifest. Socket Mode needs no public URL.

   ```yaml
   display_information:
     name: Claude Code Channel
   features:
     bot_user:
       display_name: Claude Code Channel
       always_online: true
   oauth_config:
     scopes:
       bot:
         - chat:write
         - groups:history
         - reactions:write
   settings:
     event_subscriptions:
       bot_events:
         - message.groups
     interactivity:
       is_enabled: false
     socket_mode_enabled: true
   ```

2. Under **Basic Information > App-Level Tokens**, generate a token with the
   `connections:write` scope. This is the app token (`xapp-...`).
3. Install the app to the workspace. The bot token (`xoxb-...`) is shown on
   **OAuth & Permissions**.
4. Create a private channel for Claude sessions. Invite the bot to it.
5. Copy the channel ID (channel details) and the operator's member ID (profile, then
   **Copy member ID**).

Keep the tokens in the environment that launches Claude Code. The plugin never reads them
from a file.

## Environment

| Variable | Required | Value |
|----------|----------|-------|
| `SLACK_APP_TOKEN` | yes | App-level token, `xapp-...` (scope `connections:write`) |
| `SLACK_BOT_TOKEN` | yes | Bot token, `xoxb-...` |
| `SLACK_CHANNEL_ID` | yes | ID of the private channel |
| `SLACK_OPERATOR_USER_ID` | yes | Member ID of the one person allowed to answer |
| `SLACK_QUESTION_TIMEOUT_SECONDS` | no | How long a question waits for a reply. Default `3600`. The hook also has a 3600-second limit in `hooks/hooks.json` |

If any required variable is missing, the server refuses to start and names the missing
variables. The hooks do nothing, so the terminal picker and the terminal prompts are used
as before.

## Usage

Channels are a research preview. A custom channel is not on the approved allowlist, so
the development flag is needed. It shows a confirmation dialog at startup.

```bash
# Plugin installed from the marketplace
claude --dangerously-load-development-channels plugin:slack-channel@jacobpevans-cc-plugins

# Or a server entry in a project .mcp.json named "slack" (see below)
claude --dangerously-load-development-channels server:slack
```

`--channels plugin:slack-channel@jacobpevans-cc-plugins` works without the development
flag only when the organization's `allowedChannelPlugins` setting includes this plugin.

For `server:slack`, add an entry to the project's `.mcp.json` that runs this plugin's
server with an absolute path, for example
`{"mcpServers": {"slack": {"command": "bun", "args": ["run", "--cwd", "/abs/path/to/slack-channel", "--shell=bun", "--silent", "start"]}}}`.

Inbound replies only reach a session that was started with the channel enabled.

## Security model

- **Operator gate.** Only a plain, non-bot reply from `SLACK_OPERATOR_USER_ID` in the
  session's thread is accepted. Messages from other users, bots, other channels, other
  threads, edits, and the root message are dropped without a reply.
- **Permission authority.** Anyone the gate admits can approve or deny tool use. Keep the
  channel private and make the operator the only member who can answer in it.
- **Untrusted text.** Tool descriptions, tool input, questions and options come from the
  model or from tools. They are redacted for token shapes, length-capped and escaped
  before they are posted, so they cannot mention channels or add links. Redaction is
  pattern based. It is not a guarantee that no secret is posted.
- **Credentials.** Tokens come only from the environment. They are not written to disk,
  logged, or posted.
- **State on disk.** The per-session file under the plugin data directory holds the
  channel ID and thread timestamp, and a marker while a question is waiting. It holds no
  secrets. The server removes its file on exit.
- **Question ownership.** While an `AskUserQuestion` is waiting, the hook takes the
  operator's replies, so the same message is not also sent to the session as a prompt.

## Hooks

| Hook | Matcher | Script |
|------|---------|--------|
| `PreToolUse` | `AskUserQuestion` | `hooks/ask-user-question.ts` |
| `PostToolUse` | `PushNotification` | `hooks/post-status.ts` |
| `Notification` | `idle_prompt`, `auth_success`, `elicitation_*`, `agent_*` | `hooks/post-status.ts` |
| `Stop` | (all) | `hooks/post-status.ts` |

The question hook answers with `permissionDecision: "allow"` and `updatedInput` holding
the original questions and an `answers` map keyed by question text. A multi-select answer
is its labels joined with a comma and a space. A number outside the option range asks again. Free text is
taken as the answer. If the wait ends, the hook posts a note in the thread and exits with
no output, so the terminal picker is used.

## Development

```bash
cd slack-channel
bun install
bun test
```

Tests cover the operator gate, verdict parsing, question answer mapping, redaction and
status lines, and the state files. They make no network calls.

## Limits

- Socket Mode needs an outbound websocket from the machine that runs Claude Code.
- A permission request is answered by whichever arrives first, the terminal or the thread.
- Replies and status lines are posted as Slack mrkdwn. Slack's message limits apply.

## License

Apache-2.0.
