#!/usr/bin/env python3
"""
Claude Code PostToolUse hook for README validation.
Validates README files after Write/Edit operations for required sections
and installation code blocks.

Configuration: .readme-validator.yaml (searches upward from file's directory)

Exit codes:
  0 = allow (pass or non-critical warnings only)
  2 = block (missing required sections)

Input: JSON from stdin with tool_input.file_path containing the edited file
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def find_config_file(start_path: Path) -> Path | None:
    """
    Search upward from file's directory for .readme-validator.yaml.

    Walks up to 10 directory levels, similar to how git finds .git/.
    """
    current = start_path if start_path.is_dir() else start_path.parent
    for _ in range(10):
        config = current / ".readme-validator.yaml"
        if config.exists():
            return config
        if current.parent == current:  # Reached filesystem root
            break
        current = current.parent
    return None


def parse_simple_yaml(text: str) -> dict:
    """Parse the subset of YAML used by .readme-validator.yaml (scalars and lists)."""
    result: dict = {}
    current_key = None
    current_list: list[str] | None = None

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("- ") and current_key is not None:
            if current_list is None:
                current_list = []
            current_list.append(stripped[2:].strip())
            continue
        if current_key is not None:
            if current_list is not None:
                result[current_key] = current_list
            current_list = None
            current_key = None
        if ":" in stripped:
            key, _, value = stripped.partition(":")
            key = key.strip()
            value = value.strip()
            if value:
                result[key] = value
            else:
                current_key = key
    if current_key is not None and current_list is not None:
        result[current_key] = current_list
    return result


def load_config(file_path: Path) -> dict:
    """Load README validation config from .readme-validator.yaml."""
    defaults = {
        "required_sections": ["Installation", "Usage"],
        "optional_sections": ["Contributing", "License", "API"],
    }
    config_path = find_config_file(file_path)
    if not config_path:
        return defaults
    try:
        text = config_path.read_text(encoding="utf-8")
        config = parse_simple_yaml(text)
        return {
            "required_sections": config.get(
                "required_sections", defaults["required_sections"]
            ),
            "optional_sections": config.get(
                "optional_sections", defaults["optional_sections"]
            ),
        }
    except (OSError, ValueError):
        return defaults


def parse_headings(content: str) -> list[str]:
    """Extract all h1, h2, and h3 headings from markdown content."""
    headings = []
    for line in content.splitlines():
        match = re.match(r"^#{1,3}\s+(.+)$", line)
        if match:
            headings.append(match.group(1).strip())
    return headings


def check_required_sections(content: str, required: list[str]) -> list[str]:
    """Check that all required sections exist. Returns list of missing section names."""
    headings_lower = [h.lower() for h in parse_headings(content)]
    return [s for s in required if s.lower() not in headings_lower]


def check_install_code_blocks(content: str) -> bool:
    """Check that the Installation section contains at least one code block."""
    pattern = re.compile(r"^#{1,3}\s+Installation\s*$", re.IGNORECASE | re.MULTILINE)
    match = pattern.search(content)
    if not match:
        return True  # No Installation section; required-sections check handles this
    start = match.end()
    next_heading = re.search(r"^#{1,3}\s+", content[start:], re.MULTILINE)
    section = content[start : start + next_heading.start()] if next_heading else content[start:]
    return "```" in section


def main() -> None:
    # Read hook input from stdin
    try:
        hook_input = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)  # Invalid input, fail open

    tool_input = hook_input.get("tool_input", {})
    file_path = tool_input.get("file_path", "")

    if not file_path:
        sys.exit(0)

    # Only act on README files
    file_name = Path(file_path).name
    if not re.match(r"README.*\.md$", file_name, re.IGNORECASE):
        sys.exit(0)

    # Skip if file doesn't exist
    path = Path(file_path)
    if not path.exists():
        sys.exit(0)

    config = load_config(path)

    try:
        content = path.read_text(encoding="utf-8")
    except OSError:
        sys.exit(0)  # Can't read file, fail open

    errors = []
    warnings = []

    missing = check_required_sections(content, config["required_sections"])
    if missing:
        errors.append(f"Missing required sections: {', '.join(missing)}")

    if not check_install_code_blocks(content):
        warnings.append(
            "Installation section has no code blocks "
            "(expected at least one ``` code block with install steps)"
        )

    # Check optional sections (warnings only)
    headings_lower = [h.lower() for h in parse_headings(content)]
    missing_optional = [
        s for s in config["optional_sections"] if s.lower() not in headings_lower
    ]
    if missing_optional:
        warnings.append(f"Missing optional sections: {', '.join(missing_optional)}")

    if warnings:
        print(f"README validation warnings for: {file_path}", file=sys.stderr)
        for warning in warnings:
            print(f"  - {warning}", file=sys.stderr)

    if errors:
        print("", file=sys.stderr)
        print(f"README validation FAILED for: {file_path}", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        print("", file=sys.stderr)
        print(
            "Add the missing required sections to the README "
            "or update .readme-validator.yaml to change requirements.",
            file=sys.stderr,
        )
        sys.exit(2)

    sys.exit(0)


if __name__ == "__main__":
    main()
