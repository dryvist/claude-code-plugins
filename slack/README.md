# slack

Slack messaging from any AI CLI through a shell command rather than an MCP
server.

## What it covers

A hosted Slack MCP connector was measured at **20,930 tokens in every session**
— about 18% of a typical context window — for a capability most sessions never
used, and it was reachable only from Claude Code. Its two canvas tools alone
embed the entire Canvas-flavored-Markdown authoring spec in their parameter
descriptions.

This plugin costs roughly 10 tokens until invoked, and works in every harness
that can run a shell: Claude Code, Codex, Cursor, OpenCode, Antigravity and
qwen. There is no per-harness MCP configuration to drift.

The surface is sized from recorded usage rather than guessed — across local
agent transcripts the Slack calls were `conversations.history` 284,
`search.messages` 68, `chat.postMessage` 55, `conversations.replies` 24. The
skill covers exactly those four. Channel administration (create, rename, invite,
archive) is a separate `openbao-slack-creds channel` subcommand and is out of
scope here.

## Installation

This plugin is **deliberately not enabled at user level.** Enable it in the
repositories where Slack access is part of the work, the same way domain skill
groups are scoped — a plugin earns a user-level enable only when it is useful in
nearly every repository.

```jsonc
// in the consuming repository's Claude settings
{
  "enabledPlugins": {
    "slack@jacobpevans-cc-plugins": true
  }
}
```

Requires `openbao-slack-creds` on `PATH` (provided by the workstation
configuration), secret-zero in the environment via `doppler run`, and a bot
token in OpenBao at `secrets-external/data/platform/slack-ops`.

## Usage

```sh
# read a channel (name or ID)
doppler run -- openbao-slack-creds message read incidents --limit 20

# read one thread; the ts comes from column 1 of `message read`
doppler run -- openbao-slack-creds message replies incidents 1234567890.123456

# post, and reply in a thread
doppler run -- openbao-slack-creds message send incidents "Converge finished, exit 0"
doppler run -- openbao-slack-creds message send incidents "ack" --thread 1234567890.123456
```

Output is TSV — timestamp, author, text — so it pipes into `grep`, `awk` and
`jq` without parsing prose.

**Known limitation:** `search.messages` requires a user token. The credential
here is a bot token and Slack rejects it with `not_allowed_token_type`, which is
an API constraint rather than a grantable scope. The command reports that
plainly and points at reading a specific channel instead.

## Skills

| Skill | Purpose |
| --- | --- |
| `slack-messaging` | Read, thread, send and search Slack from a shell |

## License

Apache-2.0
