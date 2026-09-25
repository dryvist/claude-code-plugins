---
skill-groups: [core, ai]
---

# Claude Code Plugins Quick Reference

Reference guide for AI assistants working with this repository.

## Repository Purpose

This is a **Claude Code plugins repository** containing production-ready hooks for development workflows.

## Available Plugins

| Plugin | Type | Tools/Commands | Purpose |
|--------|------|--------|------|
| **ai-cli-harness-better-practices** | Skill | `/goal`, `/session-status`, `/handoff`, `/resume`, `/replan`, `/wrap-up` (incl. `purge-pr` mode), `/wrap-up-docs` | Harness-agnostic session continuity: capped goal statements, done-vs-remaining snapshots, cold-start handoffs, verify-before-trust resume, stale-plan repair, and end-of-session wrap-up. Runs without a git repository |
| **ai-delegation** | Skill | `/delegate-to-ai`, `/auto-maintain`, `/premium-agent-orchestration`, `/local-subagents`, `/openrouter-models`, `/multi-model-review` | Route tasks to AI models, preserve premium reasoning while cheaper agents or local/free LLMs handle checkable work, and fan a plan/diff out to independent model families for adversarial review |
| **codeql-resolver** | Command/Skill/Agent | `/resolve-codeql` | Resolve CodeQL security alerts in GitHub Actions workflows |
| **content-guards** | Pre/PostToolUse | Bash, Write, Edit | Token limits, markdown/README validation, webfetch guard, issue/PR backlog limits, public-repo leakage guard |
| **git-guards** | PreToolUse | Bash, Edit, Write, NotebookEdit | Blocks dangerous git/gh commands and file edits on main branch |
| **git-workflows** | Command/Skill | `/sync-main`, `/git-flow-next`, `/git-workflow-standards`, `/troubleshoot-rebase`, `/troubleshoot-precommit`, `/troubleshoot-worktree`, `/pre-commit-architecture` | Local git sync, branching model, branch hygiene and merge-conflict conventions, and rebase/pre-commit/worktree troubleshooting |
| **homelab-ops** | Skill | `/homelab-runbooks`, `/proxmox-cluster-ops`, `/terrakube-ops`, `/pxe-netboot`, `/llm-router-ops`, `/workstation-offbox-backup`, `/dell-idrac-bmc-ops`, `/zfs-resumable-transfers` | Vendor/topology-neutral homelab operational runbooks: DR-node power management, DNS convergence, secrets-engine bring-up, Proxmox VE cluster operations, Terrakube operations, PXE netboot installs, LLM router operations, workstation off-box backup, Dell iDRAC BMC operations, and resumable ZFS transfers |
| **github-workflows** | Command/Skill | `/ship`, `/finalize-pr`, `/refresh-repo`, `/prune-branches` (incl. `--sweep` and `--prune-stale` modes), `/rebase-pr`, `/merge-pr` (incl. `--squash`/`-s`), `/pr-stacks`, `/pr-sweep`, `/issue-sweep`, `/resolve-pr-threads`, `/pr-standards`, `/gh-cli-patterns`, `/shape-issues`, `/trigger-ai-reviews`, `/github-actions-silent-failures` | GitHub PR/issue management workflows, staged PR stacks, cross-repo workspace sweep, stale-branch pruning, parallel open-PR sweep-to-zero, issue sweeps that reconcile open issues against reality, PR/issue creation guards and workaround classification, and diagnosing silent GitHub Actions failures |
| **infra-orchestration** | Skill | `/orchestrate-infra`, `/sync-inventory`, `/test-e2e` | Cross-repo infrastructure orchestration for Terraform and Ansible |
| **code-standards** | Skill | `/code-quality-standards` | Estate-specific code conventions: logging format, monitoring-vs-test philosophy, doc format |
| **infra-standards** | Skill | `/infrastructure-standards` | Infrastructure standards for Proxmox, Terraform, Ansible including deployment pipeline and secrets management |
| **openbao** | Skill | `/openbao-secrets`, `/openbao-dynamic-aws-creds` | OpenBao secrets access model: mint ephemeral credentials from engines instead of storing static ones; reads pre-authorized, writes human-gated; includes a concrete dynamic-AWS-STS pattern |
| **process-cleanup** | PostToolUse | — | Cleanup orphaned MCP server processes on session exit |
| **project-standards** | Skill | `/claude-skill-authoring`, `/workspace-standards`, `/skills-registry` | Claude skill authoring standards, workspace management, and skills/tools registry lookup |
| **testing** | Skill | `/test` | Dispatches UI smoke, spec authoring, healing, performance, and exploratory browser testing to specialized agents so Playwright and Browser Use load only inside the chosen agent |
| **estate-lsp** | LSP (code intelligence) | nixd, terraform-ls, yaml-language-server | Post-edit diagnostics and code navigation for Nix, Terraform/OpenTofu, and YAML. Expects the server binaries on PATH |

Session token analytics: use the `token-meter` MCP server (replaces the retired `session-analytics` plugin).

## Multi-Model Delegation

Use `/delegate-to-ai` to route tasks to external AI models, local LLMs, or native subagents.
Use `/premium-agent-orchestration` when a Fable, Opus, or other top-tier model should keep
senior judgment while cheaper agents or local/free LLMs handle checkable work.
Useful for research, code review consensus, multi-model validation, and premium-model cost control. See the `ai-delegation` plugin.
