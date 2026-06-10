# project-standards

AgentsMD authoring standards, workspace management, and skills/tools registry lookup.

See [ARCHITECTURE.md](ARCHITECTURE.md) for integration diagrams.

## Skills

- **`/agentsmd-authoring`** - File structure, token targets, two-tier architecture, frontmatter templates
- **`/workspace-standards`** - Cross-project standards, git workflow, security, cost management
- **`/skills-registry`** - Lookup table for all available tools, skills, commands, agents, plugins
- **`/nix-tool-policy`** - Never install tools that Nix dev shells provide; use the dev shell or a temporary nix shell

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/project-standards
```

## Usage

```text
/agentsmd-authoring
/workspace-standards
/skills-registry
```

## License

MIT
