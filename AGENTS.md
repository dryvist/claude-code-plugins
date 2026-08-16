# Claude Code Plugins Quick Reference

Reference guide for AI assistants working with this repository.

## Repository Purpose

This is a **Claude Code plugins repository** containing production-ready hooks for development workflows.

## Available Plugins

| Plugin | Type | Tools/Commands | Purpose |
|--------|------|--------|------|
| **ai-cli-harness-better-practices** | Skill | `/goal`, `/session-status`, `/handoff`, `/resume`, `/replan`, `/wrap-up` (incl. `purge-pr` mode) | Harness-agnostic session continuity: capped goal statements, done-vs-remaining snapshots, cold-start handoffs, verify-before-trust resume, stale-plan repair, and end-of-session wrap-up. Runs without a git repository |
| **ai-delegation** | Skill | `/delegate-to-ai`, `/auto-maintain`, `/premium-agent-orchestration`, `/delegate-to-router`, `/openrouter-models`, `/multi-model-review` | Route tasks to AI models, preserve premium reasoning while cheaper agents or local/free LLMs handle checkable work, and fan a plan/diff out to independent model families for adversarial review |
| **codeql-resolver** | Command/Skill/Agent | `/resolve-codeql` | Resolve CodeQL security alerts in GitHub Actions workflows |
| **config-management** | Skill | `/sync-permissions`, `/quick-add-permission` | Manage Claude and Gemini permission configs across repositories |
| **content-guards** | Pre/PostToolUse | Bash, Write, Edit | Token limits, markdown/README validation, webfetch guard, issue/PR backlog limits, public-repo leakage guard |
| **git-guards** | PreToolUse | Bash, Edit, Write, NotebookEdit | Blocks dangerous git/gh commands and file edits on main branch |
| **git-workflows** | Command/Skill | `/sync-main`, `/git-flow-next`, `/troubleshoot-rebase`, `/troubleshoot-precommit`, `/troubleshoot-worktree`, `/pre-commit-architecture` | Local git sync, branching model, and rebase/pre-commit/worktree troubleshooting |
| **homelab-ops** | Skill | `/homelab-runbooks`, `/proxmox-cluster-ops`, `/terrakube-ops`, `/pxe-netboot`, `/llm-router-ops`, `/workstation-offbox-backup` | Vendor/topology-neutral homelab operational runbooks: DR-node power management, DNS convergence, secrets-engine bring-up, Proxmox VE cluster operations, Terrakube operations, PXE netboot installs, LLM router operations, and workstation off-box backup |
| **github-workflows** | Command/Skill | `/ship`, `/finalize-pr`, `/refresh-repo`, `/prune-branches` (incl. `--sweep` and `--prune-stale` modes), `/rebase-pr`, `/merge-pr` (incl. `--squash`/`-s`), `/pr-sweep`, `/issue-sweep`, `/resolve-pr-threads`, `/gh-cli-patterns`, `/shape-issues`, `/trigger-ai-reviews` | GitHub PR/issue management workflows, cross-repo workspace sweep, stale-branch pruning, parallel open-PR sweep-to-zero, and issue sweeps that reconcile open issues against reality |
| **infra-orchestration** | Skill | `/orchestrate-infra`, `/sync-inventory`, `/test-e2e` | Cross-repo infrastructure orchestration for Terraform and Ansible |
| **code-standards** | Skill | `/code-quality-standards`, `/review-standards` | Code quality standards, documentation formatting, testing philosophy, and review guidelines |
| **git-standards** | Skill | `/git-workflow-standards`, `/pr-standards` | Git workflow standards, branch hygiene, PR creation guards, workaround vs fix classification, and issue linking |
| **infra-standards** | Skill | `/infrastructure-standards` | Infrastructure standards for Proxmox, Terraform, Ansible including deployment pipeline and secrets management |
| **openbao** | Skill | `/openbao-secrets`, `/openbao-dynamic-aws-creds` | OpenBao secrets access model: mint ephemeral credentials from engines instead of storing static ones; reads pre-authorized, writes human-gated; includes a concrete dynamic-AWS-STS pattern |
| **pal-health** | SessionStart | — | Warns on session start if PAL MCP had a recent Doppler auth failure |
| **pr-lifecycle** | PostToolUse | Bash | Automatically triggers `/finalize-pr` after `gh pr create` succeeds |
| **process-cleanup** | PostToolUse | — | Cleanup orphaned MCP server processes on session exit |
| **project-standards** | Skill | `/claude-skill-authoring`, `/workspace-standards`, `/skills-registry` | Claude skill authoring standards, workspace management, and skills/tools registry lookup |
| **script-guards** | PreToolUse/UserPromptSubmit + Skill | Bash, Write, Edit, `native-first` | Blocks unnecessary script/wrapper generation and supplies the `native-first` discovery ladder that finds the non-custom path |
| **session-analytics** | Skill | `/token-breakdown` | Session token analytics via Splunk OTEL telemetry |

## Multi-Model Delegation

Use `/delegate-to-ai` to route tasks to external AI models, local LLMs, or native subagents.
Use `/premium-agent-orchestration` when a Fable, Opus, or other top-tier model should keep
senior judgment while cheaper agents or local/free LLMs handle checkable work.
Useful for research, code review consensus, multi-model validation, and premium-model cost control. See the `ai-delegation` plugin.
