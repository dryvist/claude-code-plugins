# agent-teams-guard

Safety guardrails for Agent Teams: detects orphaned sessions on startup and warns with cleanup guidance.

## Purpose

Agent Teams can leave behind stale resources when a session ends unexpectedly:

- Orphaned `~/.claude/teams/*/config.json` entries where the team lead process is gone
- No signal to the user that cleanup is needed before starting a new session

This plugin adds a `SessionStart` hook that checks for these on every session open and prints
a warning to stderr with the exact `rm -rf` command needed to clean up.

## Components

### SessionStart: Orphaned Session Guard

On every session start, scans `~/.claude/teams/*/config.json` for stale team entries.
A stale entry is one where a `pid` file exists but the process is no longer alive.

**Behavior:**

- Gracefully no-ops when `~/.claude/teams/` does not exist (teams never enabled or already clean)
- Warns to stderr with the team session path and a remediation command
- Does **not** auto-delete — lets the user confirm before removing state
- Timeout: 10 seconds

**Example warning output (stderr):**

```
WARNING: Stale Agent Team session.
Path: /home/user/.claude/teams/team-abc123
Cleanup: rm -rf /home/user/.claude/teams/team-abc123
```

## Future Components

**File Conflict Guard** (`PreToolUse: Write|Edit`) — checks whether another teammate is
currently editing the same file and blocks conflicting edits with a clear message.
Tracking: see issue [#20](https://github.com/JacobPEvans/claude-code-plugins/issues/20).

**Token Budget Guard** — tracks cumulative tokens per teammate and warns before budget
exhaustion. Requires API access to token counts; deferred to a future version.

## Graceful Degradation

When Agent Teams are not enabled or `~/.claude/teams/` is absent, the `SessionStart`
hook exits silently (zero output, zero side-effects). This plugin is safe to install
even if teams are never used.

## Dependencies

Related: [agent-teams-orchestrator (#15)](https://github.com/JacobPEvans/claude-code-plugins/issues/15)
for team lifecycle management and config format documentation.
