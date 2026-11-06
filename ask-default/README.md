# ask-default

Answers every `AskUserQuestion` call at once, so the turn never waits on a dialog.

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/ask-default
```

The hook needs no setup.

## Usage

### Behavior

- A `PreToolUse` hook on `AskUserQuestion` returns `permissionDecision: "allow"`
  and `updatedInput.answers`.
- Each question gets its first option as its answer. Multi-select questions get
  only the first option too.
- The hook sets `additionalContext`. It names each default and its `qid`
  (`tool_use_id:index`), so a later human answer can correct that `qid`.
- A question whose header starts with `DESTRUCTIVE:` gets no default. The whole
  call falls through to the normal dialog.
- A question with no text or no options falls through the same way.
- Any unexpected error falls through to the dialog.

## Audit log

Each question writes one JSON line. Fields: `ts`, `qid`, `action`
(`default` or `fall_through`), `header`, and `answer` (defaults only).

The path comes from the first of these that is set:

1. `ASK_DEFAULT_AUDIT_LOG`
2. `CLAUDE_PLUGIN_DATA`, as `ask-default-audit.log` inside it
3. `~/.claude/ask-default-audit.log`

## Tests

```bash
python3 scripts/test_ask_default.py
```
