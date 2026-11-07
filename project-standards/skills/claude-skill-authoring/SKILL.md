---
name: claude-skill-authoring
description: >-
  Covers estate SKILL.md rules: layout, length limits, and self-contained
  execution. Skill design, testing, evaluation, and comparison requests use
  skill-builder.
---

# AgentsMD Authoring Standards (estate-specific)

General skill-authoring guidance (frontmatter shape, progressive disclosure,
naming) is Anthropic's own Agent Skills spec. This skill holds only what's
specific to this estate.

## File Structure

```text
agentsmd/                     # Single source of truth
├── AGENTS.md                 # Main entry point
├── rules/                    # Auto-load every session (via .claude/rules symlink)
├── skills/                   # On-demand (via .claude/skills symlink)
├── agents/                   # Task subagents (via .claude/agents symlink)
└── workflows/                # Development workflow docs

.copilot/, .claude/, .gemini/ # Vendor dirs — symlinks only, no duplicates
```

Vendor directories contain symlinks only. All canonical content lives in
`agentsmd/`. DRY — never duplicate across vendors.

## Description length

CI enforces this (see `J1` in the cost-alignment plan): a `SKILL.md`
`description` over **1024 bytes** fails the build. Soft target: **250
characters** — a trigger phrase plus a one-clause purpose. Count bytes, not
characters — Codex counts bytes (anthropics/claude-code and codex#7730).

## The self-contained rule

A skill must run correctly and safely when it loads **alone**. Before
trimming or moving anything out, ask: *"if only this skill loaded, would it
still work?"* If not, the content stays inline — token count is a flag,
never a reason to break this. Safety reminders (destructive git ops,
merge-readiness gates, least-privilege rules) stay inline even when
duplicated elsewhere; deduplicate only reference material (command catalogs,
tables, examples).

## Related Skills

- [agent-builder](../agent-builder/SKILL.md) - Author platform agents with generated exports and promotion evidence
- [skill-builder](../skill-builder/SKILL.md) - Author skills with trigger, baseline, and held-out evaluation contracts
- **skills-registry** (project-standards) — Use when looking up available skills, agents, tools, or plugins
- **workspace-standards** (project-standards) — Use when setting up or managing multi-repo workspaces
