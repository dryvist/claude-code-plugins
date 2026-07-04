# Claude Code Plugins Quick Reference

Reference guide for AI assistants working with this repository.

## Repository Purpose

This is a **Claude Code plugins repository** containing production-ready hooks for development workflows.

## Available Plugins

| Plugin | Type | Tools/Commands | Purpose |
|--------|------|--------|------|
| **ai-delegation** | Skill | `/delegate-to-ai`, `/auto-maintain` | Route tasks to external AI models (Gemini, Ollama, etc.) via PAL MCP |
| **codeql-resolver** | Command/Skill/Agent | `/resolve-codeql` | Resolve CodeQL security alerts in GitHub Actions workflows |
| **config-management** | Skill | `/sync-permissions`, `/quick-add-permission` | Manage Claude and Gemini permission configs across repositories |
| **content-guards** | Pre/PostToolUse | Bash, Write, Edit | Token limits, markdown/README validation, webfetch guard, issue/PR rate limiting, branch limits |
| **git-guards** | PreToolUse | Bash, Edit, Write, NotebookEdit | Blocks dangerous git/gh commands and file edits on main branch |
| **git-workflows** | Command/Skill | `/sync-main`, `/wrap-up` (incl. `purge-pr` mode), `/troubleshoot-rebase`, `/troubleshoot-precommit`, `/troubleshoot-worktree` | Local git sync, troubleshooting, post-merge cleanup, and atomic PR-close + branch purge |
| **github-workflows** | Command/Skill | `/ship`, `/finalize-pr`, `/refresh-repo` (incl. `--sweep` and `--prune-stale` modes), `/rebase-pr`, `/squash-merge-pr`, `/resolve-pr-threads`, `/gh-cli-patterns`, `/shape-issues`, `/trigger-ai-reviews` | GitHub PR/issue management workflows plus cross-repo workspace sweep and stale-branch pruning |
| **infra-orchestration** | Skill | `/orchestrate-infra`, `/sync-inventory`, `/test-e2e` | Cross-repo infrastructure orchestration for Terraform and Ansible |
| **code-standards** | Skill | `/code-quality-standards`, `/review-standards` | Code quality standards, documentation formatting, testing philosophy, and review guidelines |
| **git-standards** | Skill | `/git-workflow-standards`, `/pr-standards` | Git workflow standards, branch hygiene, PR creation guards, workaround vs fix classification, and issue linking |
| **infra-standards** | Skill | `/infrastructure-standards` | Infrastructure standards for Proxmox, Terraform, Ansible including deployment pipeline and secrets management |
| **pal-health** | SessionStart | — | Warns on session start if PAL MCP had a recent Doppler auth failure |
| **pr-lifecycle** | PostToolUse | Bash | Automatically triggers `/finalize-pr` after `gh pr create` succeeds |
| **process-cleanup** | PostToolUse | — | Cleanup orphaned MCP server processes on session exit |
| **project-standards** | Skill | `/claude-skill-authoring`, `/workspace-standards`, `/skills-registry` | Claude skill authoring standards, workspace management, and skills/tools registry lookup |
| **session-analytics** | Skill | `/token-breakdown` | Session token analytics via Splunk OTEL telemetry |

## Multi-Model Delegation

Use `/delegate-to-ai` to route tasks to external AI models (Gemini, local Ollama, etc.) via PAL MCP.
Useful for research, code review consensus, and multi-model validation. See the `ai-delegation` plugin.
