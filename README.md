# Claude Code Plugins

A collection of Claude Code plugins for enhanced development workflows with AI assistants.

## Available Plugins

### ai-cli-harness-better-practices

Session continuity for AI CLI agents. No git repository required.

- **Type**: Skill-based plugin
- **Skills**: `/goal`, `/session-status`, `/handoff`, `/resume`, `/replan`, `/wrap-up`
- **Purpose**: Know what you were doing, prove what is actually done, and hand
  that to a session with no memory

### ai-delegation

Delegate tasks to AI models, orchestrate premium-model work, and run autonomous maintenance loops.

- **Type**: Skill-based plugin
- **Skills**: `/delegate-to-ai`, `/auto-maintain`, `/premium-agent-orchestration`
- **Purpose**: Route tasks to available models and preserve premium reasoning for judgment while cheaper agents or local/free LLMs handle checkable work

### codeql-resolver

Systematic CodeQL alert analysis and resolution for GitHub Actions workflows.

- **Type**: Command/Skill/Agent-based plugin
- **Command**: `/resolve-codeql`
- **Purpose**: Resolve CodeQL security alerts in GitHub Actions workflows

### config-management

Sync AI tool permissions across repos and quickly add always-allow permissions.

- **Type**: Skill-based plugin
- **Skills**: `/sync-permissions`, `/quick-add-permission`
- **Purpose**: Manage Claude and Gemini permission configs across repositories

### content-guards

Combined content validation and guard plugin.

- **Type**: Pre/PostToolUse hook
- **Tools**: Bash, Write, Edit
- **Purpose**: Token limits, markdown/README validation, webfetch guard, issue/PR backlog limits

### git-guards

Combined git security and workflow protection via PreToolUse hooks.

- **Type**: PreToolUse hook
- **Tools**: Bash, Edit, Write, NotebookEdit
- **Purpose**: Blocks dangerous git/gh commands and file edits on main branch

### git-workflows

Git branch sync and local troubleshooting.

- **Type**: Command/Skill-based plugin
- **Skills**: `/sync-main`, `/git-flow-next`, `/troubleshoot-rebase`, `/troubleshoot-precommit`, `/troubleshoot-worktree`, `/pre-commit-architecture`
- **Purpose**: Maintain linear git history and keep branches in sync

### github-workflows

PR finalization, squash-merge, review thread resolution, and issue shaping.

- **Type**: Command/Skill-based plugin
- **Skills**: `/finalize-pr`, `/squash-merge-pr`, `/resolve-pr-threads`, `/shape-issues`, `/trigger-ai-reviews`, `/shared-workflow-org-refs`
- **Purpose**: GitHub PR/issue management workflows

### infra-orchestration

Cross-repo infrastructure orchestration for Terraform and Ansible workflows.

- **Type**: Skill-based plugin
- **Skills**: `/orchestrate-infra`, `/sync-inventory`, `/test-e2e`
- **Purpose**: Coordinate infrastructure changes across multiple repositories

### Standards Plugins

On-demand skill-based plugins that load specific standards as context.

| Plugin | Skills | Coverage |
|--------|--------|----------|
| **code-standards** | `/code-quality-standards`, `/review-standards` | Code quality, documentation, testing, review guidelines |
| **git-standards** | `/git-workflow-standards`, `/pr-standards` | Branching, PR creation, issue linking |
| **infra-standards** | `/infrastructure-standards` | Proxmox, Terraform, Ansible deployment |
| **project-standards** | `/claude-skill-authoring`, `/workspace-standards`, `/skills-registry`, `/nix-tool-policy` | Claude skill authoring, workspace, skills registry, Nix tool policy |

### homelab-ops

High-level operational runbooks for homelab management.

- **Type**: Skill-based plugin
- **Skills**: `/homelab-runbooks`
- **Purpose**: DR-node power management, DNS ingress convergence, secrets-engine identity bring-up

### pal-health

Warns on session start if PAL MCP had a recent Doppler auth failure.

- **Type**: SessionStart hook

### process-cleanup

Cleanup orphaned MCP server processes on session exit.

- **Type**: PostToolUse hook
- **Purpose**: Workaround for upstream MCP orphan-process bug (#1935)

### session-analytics

Claude Code session token analytics via Splunk OTEL telemetry.

- **Type**: Skill-based plugin
- **Skills**: `/token-breakdown`
- **Purpose**: Per-model token breakdown, tool call costs, cache efficiency, burn rate timeline

## Installation

### From Marketplace

```bash
claude plugins add jacobpevans-cc-plugins/<plugin-name>
```

**Available plugins**:

- `jacobpevans-cc-plugins/ai-cli-harness-better-practices`
- `jacobpevans-cc-plugins/ai-delegation`
- `jacobpevans-cc-plugins/code-standards`
- `jacobpevans-cc-plugins/codeql-resolver`
- `jacobpevans-cc-plugins/config-management`
- `jacobpevans-cc-plugins/content-guards`
- `jacobpevans-cc-plugins/git-guards`
- `jacobpevans-cc-plugins/git-standards`
- `jacobpevans-cc-plugins/git-workflows`
- `jacobpevans-cc-plugins/github-workflows`
- `jacobpevans-cc-plugins/homelab-ops`
- `jacobpevans-cc-plugins/infra-orchestration`
- `jacobpevans-cc-plugins/infra-standards`
- `jacobpevans-cc-plugins/pal-health`
- `jacobpevans-cc-plugins/process-cleanup`
- `jacobpevans-cc-plugins/project-standards`
- `jacobpevans-cc-plugins/session-analytics`

### Local Development

Clone this repository and link plugins:

```bash
git clone https://github.com/JacobPEvans/claude-code-plugins.git
cd claude-code-plugins
claude plugins link ./ai-cli-harness-better-practices
claude plugins link ./ai-delegation
claude plugins link ./code-standards
claude plugins link ./codeql-resolver
claude plugins link ./config-management
claude plugins link ./content-guards
claude plugins link ./git-guards
claude plugins link ./git-standards
claude plugins link ./git-workflows
claude plugins link ./github-workflows
claude plugins link ./homelab-ops
claude plugins link ./infra-orchestration
claude plugins link ./infra-standards
claude plugins link ./pal-health
claude plugins link ./process-cleanup
claude plugins link ./project-standards
claude plugins link ./session-analytics
```

## Usage

Plugins activate automatically after installation. Hook-based plugins (git-guards,
content-guards, pr-lifecycle, process-cleanup) intercept tool calls with no manual
invocation. Skill-based plugins provide slash commands:

```text
/ship                     # Full automation: commit, push, PR, finalize
/finalize-pr              # Drive PR to merge-ready state
/squash-merge-pr          # Validate and squash merge
/refresh-repo             # Sync main, check PRs, cleanup worktrees
/wrap-up                  # Session-completion verdict + forward artifact
/resolve-codeql           # Fix CodeQL security alerts
/delegate-to-ai           # Route tasks to available AI models
/premium-agent-orchestration # Preserve premium reasoning and delegate checkable work
```

## Architecture

Each development lifecycle plugin includes an `ARCHITECTURE.md` with mermaid diagrams
showing cross-plugin integration. See
[`github-workflows/ARCHITECTURE.md`](github-workflows/ARCHITECTURE.md) for the master
ship pipeline diagram covering the full PR lifecycle.

## Plugin Structure

Each plugin follows Claude Code official best practices. Most plugins use hook-based structure:

```text
plugin-name/
├── .claude-plugin/
│   └── plugin.json       # Plugin metadata
├── hooks/
│   └── hooks.json        # Hook configuration
├── scripts/
│   └── hook-script.py    # Implementation
└── README.md             # Plugin documentation
```

Command/skill-based plugins use a different structure:

```text
plugin-name/
├── .claude-plugin/
│   └── plugin.json       # Plugin metadata
├── commands/
│   └── command.md        # Command definition
├── skills/
│   └── skill-name/
│       └── SKILL.md      # Skill documentation
└── README.md             # Plugin documentation
```

## Contributing

See individual plugin READMEs for specific details. General contribution guidelines:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Follow conventional commits: `feat(plugin): description`
4. Sign your commits (GPG required)
5. Submit a pull request

## Development

### Requirements

- Claude Code CLI
- Python 3.10+ (for hook scripts)
- bats-core (for running tests)
- Tool-specific dependencies (see individual plugin READMEs)

### Testing Plugins Locally

```bash
# Link a plugin for testing
claude plugins link ./plugin-name

# Verify it loaded
claude plugins list

# Test functionality
# (trigger the hook conditions for the specific plugin)
```

### Running Tests

Tests are [bats](https://github.com/bats-core/bats-core) files under `tests/`.
Run them with bats directly — `-r` discovers every `.bats` file recursively:

```bash
# Run all tests
bats -r .

# Run tests for a specific plugin
bats -r tests/content-guards

# Run a single test file
bats tests/content-guards/token-limits/validate-token-limits.bats
```

### Git Hooks

Enable optional pre-push hooks that run tests before pushing:

```bash
# Enable git hooks
git config core.hooksPath .githooks

# Disable git hooks
git config --unset core.hooksPath
```

## License

Apache License 2.0 - See [LICENSE](LICENSE) for details.

## Author

JacobPEvans

- GitHub: [@JacobPEvans](https://github.com/JacobPEvans)
- Email: <20714140+JacobPEvans@users.noreply.github.com>

---

> Part of a [larger ecosystem of ~40 repos](https://docs.jacobpevans.com) — see how it all fits together.
