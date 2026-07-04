---
name: workspace-standards
description: Use when setting up or managing multi-repo workspaces
---

# Workspace Management Standards

## Cross-Project Documentation

Each project must maintain:

1. **README.md** at root: purpose, quick start, usage examples, cost implications
2. **Directory structure docs** for complex projects
3. **Change logs** for significant modifications

## Git Workflow

- **Branching**: `main` for production. Prefixes: `feature/`, `bugfix/`,
  `hotfix/`, `release/`, `chore/`.
- **Commits**: Follow Conventional Commits (`feat:`, `fix:`, `docs:`, etc.).
- **Worktrees**: All development in dedicated worktrees
  (see `/git-workflow-standards`).

## Security

- Use `.env` locally (never committed) and secure parameter stores for cloud.
- Principle of least privilege for all resources and services.

## Cost Management

| Environment | Lifecycle |
| --- | --- |
| Development | Automated shutdown |
| Testing | Manual cleanup |
| Production | Scheduled backups |

Define and monitor monthly budgets per environment.

## Project Lifecycle

- **Create**: Initialize with standard templates (README, .gitignore, LICENSE).
- **Maintain**: Review dependencies, update docs, optimize costs.
- **Retire**: Document, archive, clean up.

## Related Skills

- **claude-skill-authoring** (project-standards) — Use when authoring Claude skills/agents/rules — token budgets, progressive disclosure, placement
- **skills-registry** (project-standards) — Use when looking up available tools, skills, commands, agents, or plugins
