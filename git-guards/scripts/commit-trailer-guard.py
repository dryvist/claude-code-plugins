#!/usr/bin/env python3
"""
commit-trailer-guard.py - PreToolUse hook to rewrite Assisted-by trailer to kernel spec.

Detects `Assisted-by: Claude <...>` in git commit commands and rewrites to
`Assisted-by: Claude:<model>` per https://docs.kernel.org/process/coding-assistants.html.
"""

import json
import re
import sys
from pathlib import Path

TRAILER_PATTERN = re.compile(r"Assisted-by:\s*Claude\s*<[^>]*>")
TRAILER_REPL = "Assisted-by: Claude:{model}"

# Matches git global flags that take a value (-C/-c) to strip before subcommand detection.
_GIT_GLOBAL_VALUE = re.compile(r'^-[Cc]\s+(?:"[^"]*"|\'[^\']*\'|\S+)\s*')
# Matches valueless git global flags (-p/-P/--paginate/etc.).
_GIT_GLOBAL_BOOL = re.compile(r'^(-p|-P|--paginate|--no-pager|--no-replace-objects|--bare)\s*')


def _get_model_from_transcript(transcript_path: str) -> str:
    """Read the most recent model name from the session transcript jsonl."""
    if not transcript_path:
        return ""
    path = Path(transcript_path)
    if not path.exists():
        return ""
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
        for line in reversed(lines):
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

    if not TRAILER_PATTERN.search(command):
        sys.exit(0)

    if not command.startswith("git ") or not _is_git_commit(command):
        sys.exit(0)

    model = _get_model_from_transcript(data.get("transcript_path", ""))
    if not model:
        sys.exit(0)

    new_command = TRAILER_PATTERN.sub(TRAILER_REPL.format(model=model), command)
    if new_command == command:
        sys.exit(0)

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "permissionDecisionReason": (
                f"Trailer rewritten to kernel coding-assistants spec "
                f"(https://docs.kernel.org/process/coding-assistants.html): "
                f"model={model}"
            ),
        },
        "updatedInput": {**tool_input, "command": new_command},
    }))
    sys.exit(0)


if __name__ == "__main__":
    main()
