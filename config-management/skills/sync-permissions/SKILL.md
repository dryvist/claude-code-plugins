---
name: sync-permissions
description: "DEPRECATED — permission sync is retired; permissions now live in nix-claude-code and are governed by the auto-mode classifier"
---

# Sync Permissions (deprecated)

> **Deprecated.** This skill swept local `settings.local.json` files and merged
> approved permissions back into `ai-assistant-instructions/agentsmd/permissions/`.
> That JSON tree has been **deleted** and the local-sweep workflow (the
> `permission-sync` routine that did the same job) has been retired.

## What to do instead

- **Source of truth:** tool permissions now live in
  [`dryvist/nix-claude-code` → `data/permissions/`](https://github.com/dryvist/nix-claude-code/tree/main/data/permissions)
  (`allow.nix` / `ask.nix` / `deny.nix` / `domains.nix`). `nix-ai` renders them
  into each tool's settings. To change a permission, edit the `.nix` data and
  open a PR there.
- **Going forward:** the project is moving to an **auto-mode classifier** —
  novel commands are governed by intent at runtime rather than by an
  ever-growing static allow-list, so a periodic merge-local-overrides step is
  no longer needed.

See `dryvist/ai-assistant-instructions#680` for the migration.
