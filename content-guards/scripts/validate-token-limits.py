#!/usr/bin/env python3
"""
Claude Code PreToolUse hook for token limit enforcement.
Blocks file modifications (Write/Edit tools) that would exceed token limits.

Configuration: .token-limits.yaml (searches upward from cwd)
"""
from __future__ import annotations

import fnmatch
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional


def find_config_file() -> Optional[Path]:
    """
    Search upward from current working directory for .token-limits.yaml

    This allows the hook to work from any subdirectory, similar to how
    git finds .git/ by traversing parent directories.
    """
    current = Path.cwd()
    for _ in range(10):  # Search up to 10 directory levels
        config = current / '.token-limits.yaml'
        if config.exists():
            return config
        if current.parent == current:  # Reached filesystem root
            break
        current = current.parent
    return None


def load_config() -> tuple[dict[str, int], int]:
    """Load token limits from .token-limits.yaml"""
    config_path = find_config_file()
    if not config_path:
        # No config found, use sensible defaults
        return {}, 2000

    try:
        import yaml
        with open(config_path) as f:
            config = yaml.safe_load(f) or {}
        limits = config.get('limits', {})
        default = config.get('defaults', {}).get('max_tokens', 2000)
        return limits, default
    except Exception:
        return {}, 2000


def get_file_limit(file_path: str, limits: dict[str, int], default_limit: int) -> int:
    """Find applicable token limit for file"""
    for pattern, limit in reversed(list(limits.items())):
        if fnmatch.fnmatch(file_path, pattern):
            return limit
    return default_limit


def count_tokens(content: str) -> Optional[int]:
    """Count tokens in content using atc"""
    try:
        result = subprocess.run(
            ['atc', '-m', 'sonnet'],
            input=content,
            capture_output=True,
            text=True,
            timeout=10
        )
        output = result.stdout + result.stderr

        # Extract token count
        for line in output.split('\n'):
            if 'token' in line.lower():
                match = re.search(r'(\d+)\s+token', line)
                if match:
                    return int(match.group(1))

        # Try parsing first number
        try:
            return int(output.strip().split()[0])
        except (ValueError, IndexError):
            return None
    except (subprocess.TimeoutExpired, subprocess.SubprocessError, OSError):
        return None


def validate_file(file_path: str, content: str) -> Optional[dict[str, int | str]]:
    """Check if file would violate token limits"""
    limits, default_limit = load_config()
    file_limit = get_file_limit(file_path, limits, default_limit)

    # Skip binary files
    if file_path.endswith(('.png', '.jpg', '.pdf', '.bin', '.zip')):
        return None

    # Count tokens
    tokens = count_tokens(content)
    if tokens is None:
        # Can't count, allow (will catch in CI)
        return None

    if tokens > file_limit:
        return {
            'file': file_path,
            'tokens': tokens,
            'limit': file_limit,
            'excess': tokens - file_limit
        }

    return None


def main() -> None:
    try:
        hook_input = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)  # Invalid input, allow

    tool_name = hook_input.get('tool_name', '')
    tool_input = hook_input.get('tool_input', {})

    # Only check Write and Edit tools
    if tool_name not in ['Write', 'Edit']:
        sys.exit(0)

    file_path = tool_input.get('file_path', '')
    content = tool_input.get('content', '')

    if not file_path or not content:
        sys.exit(0)

    # Validate
    violation = validate_file(file_path, content)
    if violation:
        error = (
            f"❌ Token limit violation: {violation['file']}\n"
            f"   Tokens: {violation['tokens']} (limit: {violation['limit']}, "
            f"excess: +{violation['excess']})\n"
            f"\n"
            f"HOW TO RESOLVE — follow these steps in order:\n"
            f"\n"
            f"1. REFACTOR INTO MULTIPLE FILES (most common fix)\n"
            f"   - Split the file by logical concern (one responsibility per file)\n"
            f"   - Use imports/includes to compose the pieces back together\n"
            f"   - Example: large Nix module → split into options.nix, config.nix, services.nix\n"
            f"\n"
            f"2. EXTRACT EMBEDDED CODE TO SEPARATE FILES\n"
            f"   - NEVER embed shell scripts inside Nix files — use Nix builtins or a dedicated .sh file referenced via readFile\n"
            f"   - NEVER embed Python scripts inside YAML (GitHub Actions) — use existing marketplace actions or a committed .py file\n"
            f"   - NEVER inline large configs — put them in their own file with correct extension\n"
            f"   - Each file should contain ONE language/format only\n"
            f"   - NOTE: This means splitting into committed, version-controlled files — NOT creating temp/throwaway scripts\n"
            f"\n"
            f"3. REEVALUATE THE DIRECTORY STRUCTURE\n"
            f"   - If a file is large because it handles many concerns, rethink the structure\n"
            f"   - Create subdirectories to group related smaller files\n"
            f"   - Example: monolithic default.nix → directory with focused modules\n"
            f"\n"
            f"4. REVIEW FOR DEAD/DUPLICATE CODE\n"
            f"   - Remove unused imports, dead code, and duplicated logic\n"
            f"   - But NEVER remove comments — comments are always valuable\n"
            f"\n"
            f"IMPORTANT — DO NOT:\n"
            f"  ✗ Remove or reduce comments to save tokens (comments are ALWAYS worth keeping)\n"
            f"  ✗ Compress code onto fewer lines to fit the limit\n"
            f"  ✗ Increase the token limit in .token-limits.yaml to paper over the issue\n"
            f"  ✗ Remove documentation strings or docstrings\n"
            f"\n"
            f"The goal is SMALLER, FOCUSED FILES — not less-documented code."
        )
        print(error, file=sys.stderr)
        sys.exit(2)  # Block the operation

    sys.exit(0)  # Allow


if __name__ == '__main__':
    main()
