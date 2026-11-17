# infra-orchestration

Claude Code plugin for cross-repo infrastructure orchestration across Terraform and Ansible workflows.

## Skills

- **`/orchestrate-infra`** - Runs `/agentops:orchestrate` and adds the OpenTofu-before-Ansible dependency order
- **`/sync-inventory`** - Export Terraform inventory and distribute to Ansible repositories
- **`/test-e2e`** - End-to-end pipeline validation across Terraform and Ansible repos

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/infra-orchestration
```

## Usage

```text
/orchestrate-infra plan-all
/orchestrate-infra validate-all
/sync-inventory
/test-e2e
```

## License

MIT
