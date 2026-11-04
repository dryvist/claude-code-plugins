#!/usr/bin/env python3
"""
ask-default.py - PreToolUse hook that answers AskUserQuestion at once.

Every question gets its first option as the answer, so the turn never waits on
a dialog. A question whose header starts with "DESTRUCTIVE:" has no default:
the whole call falls through to the normal dialog. A question with no text or
no options falls through the same way. Any unexpected error also falls through.

Output: JSON on stdout with permissionDecision "allow" and updatedInput.answers,
or no output (no decision). Each question writes one audit line.
"""

import json
import os
import sys
from datetime import datetime, timezone

DESTRUCTIVE_PREFIX = "DESTRUCTIVE:"


def audit_path():
    override = os.environ.get("ASK_DEFAULT_AUDIT_LOG")
    if override:
        return override
    plugin_data = os.environ.get("CLAUDE_PLUGIN_DATA")
    if plugin_data:
        return os.path.join(plugin_data, "ask-default-audit.log")
    return os.path.expanduser("~/.claude/ask-default-audit.log")


def audit(entries):
    """Append one JSON line per entry. Never raises: logging must not block the hook."""
    try:
        path = audit_path()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        stamp = datetime.now(timezone.utc).isoformat()
        with open(path, "a") as log:
            for entry in entries:
                entry["ts"] = stamp
                log.write(json.dumps(entry, sort_keys=True) + "\n")
    except OSError:
        pass


def needs_human(question):
    options = question.get("options") or []
    header = question.get("header") or ""
    return (
        header.startswith(DESTRUCTIVE_PREFIX)
        or not question.get("question")
        or not options
        or not options[0].get("label")
    )


def decide(data):
    """Return the hook output dict, or None to fall through to the dialog."""
    if data.get("tool_name") != "AskUserQuestion":
        return None
    questions = (data.get("tool_input") or {}).get("questions") or []
    if not questions:
        return None
    tool_use_id = data.get("tool_use_id") or "none"

    if any(needs_human(question) for question in questions):
        audit(
            [
                {
                    "qid": "%s:%d" % (tool_use_id, index),
                    "action": "fall_through",
                    "header": question.get("header") or "",
                }
                for index, question in enumerate(questions)
            ]
        )
        return None

    answers = {}
    entries = []
    for index, question in enumerate(questions):
        label = question["options"][0]["label"]
        answers[question["question"]] = label
        entries.append(
            {
                "qid": "%s:%d" % (tool_use_id, index),
                "action": "default",
                "header": question.get("header") or "",
                "answer": label,
            }
        )
    audit(entries)

    applied = "; ".join(
        "%s: %s" % (entry["header"] or entry["qid"], entry["answer"]) for entry in entries
    )
    return {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "permissionDecisionReason": "ask-default: first option applied",
            "updatedInput": {"questions": questions, "answers": answers},
            "additionalContext": "Defaults applied without waiting for the operator (first option): "
            + applied
            + ". A later human answer corrects the decision for its qid only while it is still open.",
        }
    }


def main():
    try:
        data = json.loads(sys.stdin.read() or "{}")
        output = decide(data)
    except (ValueError, TypeError, AttributeError, KeyError, IndexError):
        output = None
    if output is not None:
        print(json.dumps(output))


if __name__ == "__main__":
    main()
