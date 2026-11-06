# project-standards

Claude skill authoring standards, workspace management, and skills/tools registry lookup.

See [ARCHITECTURE.md](ARCHITECTURE.md) for integration diagrams.

## Skills

- **`/agent-builder`** - Canonical v2 agents, generated runtime exports, evals, and shadow-to-live evidence
- **`/claude-skill-authoring`** - Token budgets, progressive disclosure, self-contained rule, component placement
- **`/workspace-standards`** - Cross-project standards, git workflow, security, cost management
- **`/skills-registry`** - Lookup table for all available tools, skills, commands, agents, plugins
- **`/nix-tool-policy`** - Never install tools that Nix dev shells provide; use the dev shell or a temporary nix shell
- **`/capture-app-config`** - Unlock Nix-managed app settings, capture UI changes, verify, and freeze

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/project-standards
```

## Usage

```text
/agent-builder
/claude-skill-authoring
/workspace-standards
/skills-registry
/capture-app-config
```

## License

MIT
