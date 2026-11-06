#!/usr/bin/env python3
"""Tests for the ask-default hook."""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HOOK = Path(__file__).parent / "ask-default.py"


def run_hook(tool_input):
    """Run the hook on an AskUserQuestion call. Return (output or None, audit entries)."""
    with tempfile.TemporaryDirectory() as tmp:
        audit_log = Path(tmp) / "audit.log"
        env = {**os.environ, "ASK_DEFAULT_AUDIT_LOG": str(audit_log)}
        payload = {
            "tool_name": "AskUserQuestion",
            "tool_input": tool_input,
            "tool_use_id": "toolu_test",
        }
        result = subprocess.run(
            [sys.executable, str(HOOK)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            env=env,
        )
        assert result.returncode == 0, result.stderr
        entries = []
        if audit_log.exists():
            entries = [json.loads(line) for line in audit_log.read_text().splitlines()]
    output = json.loads(result.stdout) if result.stdout.strip() else None
    return output, entries


def question(text, header, labels, multi=False):
    return {
        "question": text,
        "header": header,
        "multiSelect": multi,
        "options": [{"label": label, "description": "d"} for label in labels],
    }


def test_first_option_answers_every_question():
    questions = [
        question("Which color?", "Color", ["Red", "Blue"]),
        question("Which size?", "Size", ["Small", "Large", "XL"]),
        question("Which features?", "Features", ["Alpha", "Beta"], multi=True),
    ]
    output, entries = run_hook({"questions": questions})
    decision = output["hookSpecificOutput"]
    assert decision["permissionDecision"] == "allow", decision
    assert decision["updatedInput"]["answers"] == {
        "Which color?": "Red",
        "Which size?": "Small",
        "Which features?": "Alpha",
    }, decision["updatedInput"]
    assert decision["updatedInput"]["questions"] == questions
    assert [e["action"] for e in entries] == ["default", "default", "default"], entries
    print("PASS: first option answers every question, one audit line each")


def test_destructive_header_falls_through():
    questions = [
        question("Which color?", "Color", ["Red", "Blue"]),
        question("Drop the table?", "DESTRUCTIVE: drop table", ["Yes", "No"]),
    ]
    output, entries = run_hook({"questions": questions})
    assert output is None, output
    assert [e["action"] for e in entries] == ["fall_through", "fall_through"], entries
    print("PASS: DESTRUCTIVE: header falls through to the dialog for the whole call")


def main():
    test_first_option_answers_every_question()
    test_destructive_header_falls_through()


if __name__ == "__main__":
    main()
