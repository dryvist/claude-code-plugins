#!/usr/bin/env python3
"""
commit-trailer-guard.py - PreToolUse hook to enforce kernel coding-assistants spec.

Per https://docs.kernel.org/process/coding-assistants.html:
  Correct:   Assisted-by: Claude:claude-opus-4-7
  Wrong:     Assisted-by: Claude <noreply@anthropic.com>  (email form)
  Wrong:     Assisted-by: Claude                          (bare, no model)
  Stripped:  🤖 Generated with [Claude Code](...)         (not part of spec)
"""

import json
import re
import sys
from pathlib import Path

# Matches the email form and the bare form, but NOT the already-correct Agent:model form.
# \b after Claude prevents false matches on names like "Claudette", "Claudine", etc.
TRAILER_PATTERN = re.compile(r"Assisted-by:\s*Claude\b(?:\s*<[^>]*>|(?!\s*:\S))")
TRAILER_REPL = "Assisted-by: Claude:{model}"

_ROBOT_URL_PATTERN = r"🤖 Generated with \[Claude Code\]\([^)]*\)"
# When the robot line is preceded by a blank line, replace the pair with a single newline
# so the text before it still ends cleanly (e.g. heredoc EOF stays on its own line).
_ROBOT_DOUBLE_NL = re.compile(r"\n\n" + _ROBOT_URL_PATTERN + r"\n?")
# When the robot line has no preceding blank, remove it entirely.
_ROBOT_SINGLE = re.compile(r"(?:\n|^)" + _ROBOT_URL_PATTERN + r"\n?")

# Matches git global flags that take a value (-C/-c) to strip before subcommand detection.
_GIT_GLOBAL_VALUE = re.compile(r'^-[Cc]\s+(?:"[^"]*"|\'[^\']*\'|\S+)\s*')
# Matches valueless git global flags (-p/-P/--paginate/etc.).
_GIT_GLOBAL_BOOL = re.compile(r'^(-p|-P|--paginate|--no-pager|--no-replace-objects|--bare)\s*')


def _get_model_from_transcript(transcript_path: str) -> str:
    """Read the most recent model name from the session transcript jsonl.

    Reads at most 8 KB from the tail to avoid loading large transcripts.
    """
    if not transcript_path:
        return ""
    path = Path(transcript_path)
    if not path.exists():
        return ""
    try:
        with open(path, "rb") as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - 8192))
            tail = f.read().decode("utf-8", errors="replace")
        for line in reversed(tail.splitlines()):
            line = line.strip()
            if not line:
                continue
            try:
                model = json.loads(line).get("message", {}).get("model", "")
                if model:
                    return model
            except json.JSONDecodeError:
                continue
    except OSError:
        pass
    return ""


def _is_git_commit(command: str) -> bool:
    """Return True if the command's effective git subcommand is 'commit'."""
    rest = command[4:].strip() if command.startswith("git ") else ""
    while rest:
        m = _GIT_GLOBAL_VALUE.match(rest)
        if m:
            rest = rest[m.end():]
            continue
        m = _GIT_GLOBAL_BOOL.match(rest)
        if m:
            rest = rest[m.end():]
            continue
        break
    tokens = rest.split()
    return bool(tokens) and tokens[0] == "commit"


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)

    if data.get("tool_name") != "Bash":
        sys.exit(0)

    tool_input = data.get("tool_input", {})
    command = tool_input.get("command", "")

    is_commit = command.startswith("git ") and _is_git_commit(command)
    needs_trailer_fix = is_commit and bool(TRAILER_PATTERN.search(command))
    needs_robot_strip = bool(_ROBOT_DOUBLE_NL.search(command) or _ROBOT_SINGLE.search(command))

    if not needs_trailer_fix and not needs_robot_strip:
        sys.exit(0)

    model = ""
    if needs_trailer_fix:
        model = _get_model_from_transcript(data.get("transcript_path", ""))
        if not model:
            needs_trailer_fix = False

    new_command = command
    if needs_robot_strip:
        new_command = _ROBOT_DOUBLE_NL.sub("\n", new_command)
        new_command = _ROBOT_SINGLE.sub("", new_command)
    if needs_trailer_fix:
        new_command = TRAILER_PATTERN.sub(TRAILER_REPL.format(model=model), new_command)

    if new_command == command:
        sys.exit(0)

    reason_parts = []
    if needs_trailer_fix:
        reason_parts.append(f"trailer rewritten (model={model})")
    if needs_robot_strip:
        reason_parts.append("robot-signature line stripped")

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "permissionDecisionReason": (
                "kernel coding-assistants spec enforced "
                f"(https://docs.kernel.org/process/coding-assistants.html): "
                + ", ".join(reason_parts)
            ),
        },
        "updatedInput": {**tool_input, "command": new_command},
    }))
    sys.exit(0)


if __name__ == "__main__":
    main()
