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
| **git-workflows** | Command/Skill | `/sync-main`, `/wrap-up`, `/troubleshoot-rebase`, `/troubleshoot-precommit`, `/troubleshoot-worktree` | Local git sync, troubleshooting, and post-merge cleanup |
| **github-workflows** | Command/Skill | `/ship`, `/finalize-pr`, `/refresh-repo`, `/rebase-pr`, `/squash-merge-pr`, `/resolve-pr-threads`, `/gh-cli-patterns`, `/shape-issues`, `/trigger-ai-reviews` | GitHub PR/issue management workflows |
| **infra-orchestration** | Skill | `/orchestrate-infra`, `/sync-inventory`, `/test-e2e` | Cross-repo infrastructure orchestration for Terraform and Ansible |
| **code-standards** | Skill | `/code-quality-standards`, `/review-standards` | Code quality standards, documentation formatting, testing philosophy, and review guidelines |
| **git-standards** | Skill | `/git-workflow-standards`, `/pr-standards` | Git workflow standards, branch hygiene, PR creation guards, and issue linking |
| **infra-standards** | Skill | `/infrastructure-standards` | Infrastructure standards for Proxmox, Terraform, Ansible including deployment pipeline and secrets management |
| **pal-health** | SessionStart | — | Warns on session start if PAL MCP had a recent Doppler auth failure |
| **pr-lifecycle** | PostToolUse | Bash | Automatically triggers `/finalize-pr` after `gh pr create` succeeds |
| **process-cleanup** | PostToolUse | — | Cleanup orphaned MCP server processes on session exit |
| **project-standards** | Skill | `/agentsmd-authoring`, `/workspace-standards`, `/skills-registry` | AgentsMD authoring standards, workspace management, and skills/tools registry lookup |
| **session-analytics** | Skill | `/token-breakdown` | Session token analytics via Splunk OTEL telemetry |

## Multi-Model Delegation

Use `/delegate-to-ai` to route tasks to external AI models (Gemini, local Ollama, etc.) via PAL MCP.
Useful for research, code review consensus, and multi-model validation. See the `ai-delegation` plugin.

## Agent Teams Orchestration

### Delegation Hierarchy

1. **Agent Teams** — For complex work requiring collaboration, debate, or cross-checking
2. **Subagents (Task tool)** — For focused, independent tasks where only the result matters
3. **Direct execution** — For simple tasks within the main context

### When to Use Agent Teams vs Subagents

| Criteria | Use Subagents | Use Agent Teams |
|----------|--------------|-----------------|
| Tasks need to communicate | No | Yes |
| Work is independent | Yes | Either |
| Need cross-checking | No | Yes |
| Cost sensitivity | High | Low |
| Task count | 1–3 tasks | 4+ parallel tasks |
| Duration | Short (<5 min) | Long (5+ min) |
| Complexity | Focused | Multi-perspective |

### Model Routing

| Task Type | Model | Team Role | PAL MCP Tool |
|-----------|-------|-----------|--------------|
| Team Lead | Opus 4.6 | Lead (delegate mode) | N/A |
| Research | Sonnet 4.5 | Researcher teammate | chat, clink |
| Implementation | Sonnet 4.5 | Implementer teammate | codereview |
| Validation | Haiku 4.5 | Verifier teammate | chat |
| Code Review | Multi-model | Multiple reviewers | consensus |

### Team Communication Guidelines

- Prefer targeted `write` over expensive `broadcast`
- Use plan approval for risky changes
- Task list is the source of truth for work status
- Teammates should self-claim tasks, not wait for assignment
- Lead should focus on coordination, not implementation (delegate mode)

### Agent Team Token Costs

- Each teammate is a separate Claude instance (~20K token startup)
- N teammates ≈ N× token cost
- Use teams only when parallel collaboration adds value
- Start with 3–5 teammates; scale based on task complexity
- Use Haiku for simple teammates to reduce costs
