# Plugin / Skill Categories

Canonical categorization metadata for Claude Code plugins and shared agent skills,
consumed by both nix-ai and nix-devenv. Lets users opt-out of plugin/skill bundles
they don't need (or whitelist the ones they do) at the home-manager layer, with
optional per-project re-enablement via direnv shells.

The schema lives in `categories.nix` next to this file. Both nix-ai modules import
it via the existing `jacobpevans-cc-plugins` flake input.

## Why categorize

Claude Code, Codex, and Gemini all auto-load every plugin and skill from every
registered marketplace. The combined skill list grows unbounded — many skills are
relevant only situationally (Microsoft Office formats, Obsidian markdown, browser
automation, etc.) yet still consume context budget and create false-positive
trigger candidates for the skill router. Categories let you trim the default set
down to what you actually use, and pull in extras when you need them.

## Schema

```nix
{
  schemaVersion = 1;

  defaults.<category> = {
    enabled  :: Bool;     # default state
    alwaysOn :: Bool?;    # if true, cannot be disabled or excluded by enableOnly
  };

  members.<category> = {
    claudePlugins  :: [String];   # "<plugin>@<marketplace>" refs masked off
                                  # in ~/.claude/settings.json
    skills         :: [String];   # SKILL.md folder names filtered out of
                                  # ~/.agents/skills/
    claudeCommands :: [String];   # synthesized "<plugin>-<command>" names from
                                  # agent-skills discoverClaudeCommands
  };
}
```

## Plugin-level vs skill-level granularity (asymmetry)

Two parallel skill-delivery systems consume this schema:

1. **Claude plugins** (`programs.claude.plugins.enabled` →
   `~/.claude/settings.json`) — plugin-level. Disabling a category drops every
   plugin in `claudePlugins` whole. Side-effect: bundled plugins like
   `document-skills` lose all their skills (pptx + docx + xlsx + pdf +
   canvas-design + ...).
2. **agentSkills** (`~/.agents/skills/<name>/SKILL.md`, consumed by Codex,
   Gemini, and Claude) — skill-level. Disabling a category filters by SKILL.md
   folder name. So `microsoft-office` only drops `pptx`, `docx`, `xlsx` SKILL.md
   files — `pdf`, `canvas-design`, etc. still deploy.

This means disabling `microsoft-office` gives you:

- **Claude Code**: loses pptx + docx + xlsx **plus** pdf, canvas-design,
  frontend-design, claude-api, mcp-builder, theme-factory, algorithmic-art,
  skill-creator, doc-coauthoring, web-artifacts-builder, webapp-testing —
  because they all live in the same `document-skills` plugin and Claude Code
  only toggles at plugin level.
- **Codex / Gemini**: loses **only** pptx, docx, xlsx. Other skills survive
  because we filter by SKILL.md name, not by parent plugin.

If the Claude-side over-pruning bites you, see Phase 2 in the design plan:
synthetic marketplaces split bundled plugins into smaller per-category plugins
so Claude Code can also be surgical. Pattern already exists in nix-ai
(`modules/claude/marketplace-overrides.nix` → `browserUseMarketplace`,
`fabricMarketplace`).

## How activation works (high level)

- **Global default** — set
  `programs.claude.plugins.categories.disabled = [ "microsoft-office" ]` in your
  nix-darwin config. After `darwin-rebuild`, `~/.claude/settings.json` and
  `~/.agents/skills/` reflect the mask.
- **Whitelist** — set
  `programs.claude.plugins.categories.enableOnly = [ "infra" ]` for an
  aggressive minimum. `core` is implicitly added; cannot be excluded.
- **Per-project re-enable** — use
  `nix-devenv.lib.mkClaudeShell { enable = [ "microsoft-office" ]; }` in a
  repo's `flake.nix` plus direnv. On `cd` into the repo, the shell hook writes
  `${PROJECT_ROOT}/.claude/settings.json` enabling the plugin refs for that
  category. On `cd` out, the overlay is removed. (Claude Code only —
  agentSkills is global.)

See `nix-ai/modules/claude/plugins/CATEGORIES.md` for the full activation
reference and `nix-devenv/shells/claude-categories/README.md` for the devshell
pattern.

## Adding a new category

`categories.nix` auto-discovers any `*.nix` file in `./categories/`. Adding a
new category is a single-file change:

1. Pick a name (kebab-case, descriptive — e.g. `data-engineering`,
   `mobile-dev`). The filename (sans `.nix`) becomes the category name.
2. Create `./categories/<name>.nix` returning an attrset:

   ```nix
   {
     default = { enabled = false; };  # or true; add `alwaysOn = true;` for core-like
     claudePlugins  = [ "<plugin>@<marketplace>" ];
     skills         = [ "<skill-folder-name>" ];
     claudeCommands = [ "<plugin>-<command>" ];   # synthesized; only for
                                                  # plugins in marketplaces
                                                  # that get discoverClaudeCommands
   }
   ```

3. Open a PR to claude-code-plugins. The eval-time assertion in
   `categories.nix` checks for duplicate skill names across categories.
4. Once merged, bump the `jacobpevans-cc-plugins` flake input in nix-ai and
   run `nix flake check` — additional structural assertions there catch
   typos in the consumer wiring.

You do NOT edit `categories.nix` itself when adding a category. It walks
`./categories/` automatically.

## Renaming or removing a category

Categories are user-facing API (users reference them in
`programs.claude.plugins.categories.{disabled,enableOnly}`). Renames and
removals are breaking changes.

To rename:

1. Copy the existing category file to the new name; keep both files in one PR.
2. Wait at least one nix-ai release cycle so users can migrate their lists.
3. Delete the old file in a follow-up PR.

To remove:

1. Empty the members lists (`claudePlugins = []; skills = []; claudeCommands = [];`)
   but keep the file in place so the category name still exists. Bump version
   notes.
2. Delete the file after one nix-ai release cycle.

The "empty file then delete" two-step gives users a release window to remove
references from their configs without eval-time errors.

## Known limitations

- **Skill-name conflicts** — two categories must not share a skill name; the
  `skillsToDrop` resolver does not detect duplicates. Eval-time validation in
  nix-ai checks this.
- **External marketplace coverage** — categories can reference plugins from any
  marketplace, but skill-level filtering only works for marketplaces that
  nix-ai's `agent-skills/default.nix` actually imports into `sharedSkills`.
  Today that's: `jacobpevans-cc-plugins`, `vct-cribl-pack-validator-skills`,
  `huggingface-skills`, `claude-plugins-official`. Adding more marketplaces is
  a one-line change there.
- **MCP servers** — out of scope. MCP server enablement is handled separately
  by `programs.claude.mcpServers.<name>.disabled`. If categories prove useful,
  extending this schema with `mcpServers = [ ... ]` is a Phase 2 enhancement.
