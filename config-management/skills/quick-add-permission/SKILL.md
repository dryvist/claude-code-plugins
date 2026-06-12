---
name: quick-add-permission
description: "DEPRECATED — permissions moved to nix-claude-code; edit data/permissions/*.nix there instead of this repo's JSON"
---

# Quick Add Permission (deprecated)

> **Deprecated.** This skill added always-allow entries to
> `ai-assistant-instructions/agentsmd/permissions/{allow,ask,deny}.json` and the
> `.gemini/permissions/` mirror. That JSON tree has been **deleted**.

## What to do instead

To add a permission, edit the Nix data in
[`dryvist/nix-claude-code` → `data/permissions/`](https://github.com/dryvist/nix-claude-code/tree/main/data/permissions)
and open a PR there:

- `allow.nix` — auto-approved commands (bare command, no trailing `*` — the
  formatter appends the space-wildcard).
- `ask.nix` — commands that prompt first.
- `deny.nix` — hard-blocked commands.
- `domains.nix` — `WebFetch` domains.

`nix-ai` reads this via `nix-claude-code.lib.permissions` and renders the
per-tool settings (Claude / Codex / Gemini / Copilot). The project is also
moving to an **auto-mode classifier**, where novel commands are governed by
intent at runtime rather than by a static allow-list.

See `dryvist/ai-assistant-instructions#680` for the migration.
