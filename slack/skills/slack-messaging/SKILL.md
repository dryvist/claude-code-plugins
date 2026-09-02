---
name: slack-messaging
description: "Read, search, send and reply to Slack messages from any AI CLI without an MCP server. Use when a task needs to read a channel, find a past message, post an update, or answer in a thread — and whenever you are about to reach for a Slack MCP tool that is not attached."
---

# Slack messaging without MCP

Slack is reachable from a shell, in every harness, through one command. There is
no MCP server to attach and nothing to install per-tool.

> **Why this exists**: a hosted Slack MCP connector was measured at **20,930
> tokens in every session** — 18% of a typical context window — for a capability
> most sessions never used, and it worked only in Claude Code. This skill plus
> the CLI costs about 10 tokens until you invoke it, and works in Claude, Codex,
> Cursor, OpenCode, Antigravity and qwen alike, because all of them can run a
> shell.

## The command

`openbao-slack-creds message <subcommand>` — the credential is minted from
OpenBao at call time and never stored.

| Need | Command |
| --- | --- |
| Read a channel | `openbao-slack-creds message read <channel> [--limit N]` |
| Read a thread | `openbao-slack-creds message replies <channel> <thread-ts>` |
| Post a message | `openbao-slack-creds message send <channel> "<text>"` |
| Reply in a thread | `openbao-slack-creds message send <channel> "<text>" --thread <ts>` |
| Search | `openbao-slack-creds message search "<query>"` — see the caveat below |

`<channel>` takes a name or an ID. A name is resolved through
`conversations.list`; an ambiguous name is an error rather than a guess.

Output is TSV — timestamp, author, text — so it pipes into `grep`, `awk` and
`jq` without parsing prose.

## Step 1: Confirm the credential path is available

The command mints a bot token from OpenBao at call time. That needs secret-zero
in the environment, which `doppler run` supplies:

```sh
doppler run -- openbao-slack-creds message read general --limit 5
```

If it reports the AppRole variables are missing, you are outside a `doppler run`
context — that is the fix, not a reason to find a token elsewhere.

**Never paste a Slack token, never export one into a shell profile, and never
write one to disk.** The whole point of the OpenBao path is that the credential
is short-lived and attributable to the run that asked for it.

## Step 2: Read before you write

Posting to Slack is visible to other people and cannot be quietly undone. Read
the channel first so a reply lands in context:

```sh
doppler run -- openbao-slack-creds message read incidents --limit 20
```

Then reply in the thread rather than the channel when you are answering
something specific:

```sh
doppler run -- openbao-slack-creds message send incidents "Converge finished, exit 0" --thread 1234567890.123456
```

The `ts` value in the first column of `message read` output is the thread
timestamp.

## Step 3: Confirm before posting

Sending is outward-facing. Unless the user has already asked for the message to
go out, show them the text and the destination channel first and let them
approve it. A draft in the conversation costs nothing; a wrong message in a
shared channel cannot be recalled.

## Search has a real limitation

`search.messages` requires a **user** token. The credential here is a bot token,
and Slack rejects bot tokens on that endpoint with `not_allowed_token_type` —
this is an API constraint, not a scope anyone can grant.

The command reports that plainly rather than failing obscurely. When you hit it,
read the specific channel instead:

```sh
doppler run -- openbao-slack-creds message read <channel> --limit 200 | grep -i "<term>"
```

## Channel administration is a separate subcommand

Creating, renaming, inviting to and archiving channels live under
`openbao-slack-creds channel ...`, which uses the same bot token. Run it with no
arguments for its usage. Archiving is Slack's non-admin equivalent of deletion —
channels are not destroyed.

## Related

- **openbao-secrets** — the credential model this depends on: mint, never store.
- `openbao-slack-creds token` / `rotate` — app-configuration tokens, a different
  identity from the bot token used here. Do not mix them up.
