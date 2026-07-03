# pr-lifecycle

PostToolUse hook that automatically triggers `/finalize-pr` after `gh pr create` succeeds.

See [ARCHITECTURE.md](ARCHITECTURE.md) for integration diagrams.

## Installation

Installed automatically via the `jacobpevans-cc-plugins` flake input. The `development.nix`
module auto-discovers all plugin directories — no manual registration needed.

## Usage

No manual invocation required. The hook activates automatically after any successful
`gh pr create` command, triggering `/finalize-pr` on the newly created PR.

## How It Works

The hook monitors Bash tool calls for `gh pr create` commands. When a PR is successfully
created (detected by a GitHub PR URL in the output), it emits a `systemMessage` instructing
Claude to invoke `/finalize-pr` with the new PR number.

## Hook Details

| Field | Value |
|-------|-------|
| Event | PostToolUse |
| Matcher | Bash |
| Timeout | 10s |
| Trigger | `gh pr create` with successful PR URL in output |
