---
description: Permission format rules for AI tool settings — enforces Bash(command *) space-wildcard format
globs:
  - "data/permissions/**"
---

# Permission Format

> Permissions now live in
> [`dryvist/nix-claude-code` → `data/permissions/`](https://github.com/dryvist/nix-claude-code/tree/main/data/permissions)
> (the `agentsmd/permissions/` JSON tree was retired — see
> `dryvist/ai-assistant-instructions#680`). The format rules below still apply to
> the `.nix` data.

## Generated Format

The correct format for Claude Code permission entries is `Bash(command *)` — **space-wildcard**, not colon-wildcard.

| Correct | Deprecated |
| --- | --- |
| `Bash(git *)` | `Bash(git:*)` |
| `Bash(docker exec *)` | `Bash(docker exec:*)` |
| `Bash(pytest *)` | `Bash(pytest:*)` |

The `:*` suffix format is deprecated per Claude Code documentation.

## Source Format

Source `.nix` files in `nix-claude-code/data/permissions/` store bare commands
with no suffix:

```nix
{
  commands = [
    "git"
    "docker exec"
    "pytest"
  ];
}
```

The Nix formatter appends a space followed by `*` when generating `settings.json`. Never add `:*` or a trailing space-wildcard to source files.

## Nix-First Invocation

Allow direct tool invocations from nix dev shells — not wrapper forms:

| Correct (nix-first) | Unnecessary wrapper |
| --- | --- |
| `pytest` | `.venv/bin/pytest` |
| `ansible-lint` | `uv run ansible-lint` |
| `playwright` | `npx playwright` |
| `bun test` | `bun run test` |

## Precedence

Permission resolution order: **deny > ask > allow**.

Adding a command to `allow` does NOT override an `ask` entry for the same command prefix.
To allow `python -m pytest` without prompting, ensure `python` is NOT in `ask/`.
