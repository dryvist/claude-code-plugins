# project-standards

Claude skill authoring standards, workspace management, and skills/tools registry lookup.

See [ARCHITECTURE.md](ARCHITECTURE.md) for integration diagrams.

## Skills

- **`/claude-skill-authoring`** - Token budgets, progressive disclosure, self-contained rule, component placement
- **`/workspace-standards`** - Cross-project standards, git workflow, security, cost management
- **`/skills-registry`** - Lookup table for all available tools, skills, commands, agents, plugins
- **`/nix-tool-policy`** - Never install tools that Nix dev shells provide; use the dev shell or a temporary nix shell

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/project-standards
```

## Usage

```text
/claude-skill-authoring
/workspace-standards
/skills-registry
```

## License

MIT
