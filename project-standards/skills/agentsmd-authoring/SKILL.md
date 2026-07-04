---
name: agentsmd-authoring
description: Use when authoring or editing skills, agents, rules, or CLAUDE.md/AGENTS.md — token budgets, progressive disclosure, the self-contained-skill rule, the safety-reminder carve-out, and where each component belongs
---

# AgentsMD Authoring Standards

**Commands are skills.** A slash command and a skill are the same mechanism — a
`SKILL.md` (or a legacy flat `commands/*.md`) that you or the model can invoke.
Author everything new as a skill; flat `commands/*.md` still work but are legacy.

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

## Token Budget

Everything is measured in **tokens** — the actual context cost — not lines or
bytes. Count with the same tool the guard uses: `atc -m sonnet`. The budget
depends on *when the file loads into context*:

| Tier | Files | Loads | Target | Max |
| --- | --- | --- | --- | --- |
| Always-on | `CLAUDE.md`/`AGENTS.md`, `.claude/rules/*`, plugin `rules/*` | every session | 500 | 1000 |
| On-demand body | `skills/*/SKILL.md`, `agents/*.md`, `commands/*.md` | when invoked, then persists | 1500 | 3500 |
| Reference | `skills/*/references/*.md` | only when the body links to it | single-topic | — |

A skill **description** is always loaded (it drives skill selection): keep the
combined `description` + `when_to_use` within the **1,536-char** listing cap and
lead with the use case.

**Canonical catalogs and state machines** (e.g. `gh-cli-patterns`, `finalize-pr`)
may exceed the on-demand max — record an explicit waiver rather than splitting a
procedure that must stay whole.

## The two rules that override token count

1. **Self-contained execution.** A skill must run correctly and safely when it
   loads **alone**. Before trimming or moving anything out, ask: *"if only this
   skill loaded, would it still work?"* If not, the content stays inline. Token
   count is a flag, never a reason to break this.
2. **Safety reminders stay inline — even when duplicated.** A "see X" reference
   is absent when only the referencing skill loads, so keep invocation-local
   correctness/safety content inline in every skill that acts on it (destructive
   git ops, merge-readiness gates, "don't act on stale state", least-privilege
   rules in editing agents). Deduplicate *reference material* (command catalogs,
   queries, examples, tables) — never decision logic a caller needs before it
   knows to load the source.

## Progressive disclosure

Keep `SKILL.md` to the essential procedure. Move offloadable reference material
(long examples, lookup tables, command catalogs, background) into
`skills/<name>/references/*.md` and link to it from the body — those files cost
nothing until the body points to them. Offload only what the self-contained rule
permits.

## Agents vs Skills

| Component | Location | Purpose |
| --- | --- | --- |
| Skill | `skills/` | The canonical "right way" — reusable procedure/decision tree |
| Agent | `agents/` | A single-responsibility worker that *references* skills |

Agents do NOT duplicate skill logic — they reference it. Exception: an agent that
is itself the actor performing a risky change keeps the relevant safety rule
inline (self-contained rule).

## Naming Convention

- **Skills**: `noun-pattern` (e.g., `permission-patterns`)
- **Agents**: `noun-doer` (e.g., `permissions-analyzer`)

## Frontmatter Templates

**Skill**:

```yaml
---
name: skill-name
description: Lead with the use case; ≤1,536 chars combined with when_to_use
---
```

**Agent**:

```yaml
---
name: agent-name
description: Action-focused description
model: haiku  # or sonnet/opus
author: JacobPEvans
allowed-tools: [list of tools]
---
```

## Cross-Referencing

- **In CLAUDE.md**: Use `@path/to/file` to compose content inline. Use markdown
  links only for conditional "see X if relevant" references.
- **In agents/skills/rules**: Reference by name (e.g., "the code-standards
  rule"). Rules in `.claude/rules/` auto-load.

## Vendor Config Standard

Vendor directories contain symlinks only. All canonical content lives in
`agentsmd/`. DRY — never duplicate across vendors. Rules in `agentsmd/rules/`
auto-load every session via the `.claude/rules` symlink; hold them to the
always-on tier budget above.

## Related Skills

- **skills-registry** (project-standards) — Use when looking up available skills, agents, tools, or plugins
- **workspace-standards** (project-standards) — Use when setting up or managing multi-repo workspaces
- **code-quality-standards** (code-standards) — DRY and documentation-format rules applied here
