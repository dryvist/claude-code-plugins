---
name: skills-registry
description: Use when looking up available tools, skills, commands, agents, or plugins
---

# Skills & Tools Registry

## Plugin Slash Commands

| Intent | Command | Plugin | Notes |
| --- | --- | --- | --- |
| Sync branch with main | `/sync-main` | `git-workflows` | Merge into current |
| Sync repo, cleanup | `/refresh-repo` | `git-workflows` | Also merges PRs |
| Rebase + merge PR | `/rebase-pr` | `git-workflows` | Local rebase-merge |
| Squash + merge PR | `/squash-merge-pr` | `github-workflows` | Squash-merge |
| Troubleshoot rebase | `/troubleshoot-rebase` | `git-workflows` | Recover failures |
| Troubleshoot worktrees | `/troubleshoot-worktree` | `git-workflows` | Fix refname |
| Troubleshoot pre-commit | `/troubleshoot-precommit` | `git-workflows` | Fix hooks |
| Pre-commit architecture | `/pre-commit-architecture` | `git-workflows` | Hook/config homes |
| Shared workflow org refs | `/shared-workflow-org-refs` | `github-workflows` | Literal `uses:` owners |
| Nix tool policy | `/nix-tool-policy` | `project-standards` | No ad-hoc installs |
| Manage your PR | `/finalize-pr` | `github-workflows` | PR author flow (`all`/`org` for multi-repo) |
| Create GitHub issues | `/shape-issues` | `github-workflows` | Shape Up method |
| Resolve PR threads | `/resolve-pr-threads` | `github-workflows` | Thread resolution |
| Resolve CodeQL alerts | `/resolve-codeql` | `codeql-resolver` | Fix alerts |
| Autonomous maintenance | `/auto-maintain` | `ai-delegation` | Finds work |
| Delegate to AI models | `/delegate-to-ai` | `ai-delegation` | External AI |
| Sync permissions | `/sync-permissions` | `config-management` | Merge perms |
| Add tool permissions | `/quick-add-permission` | `config-management` | Quick allow |
| Orchestrate infra | `/orchestrate-infra` | `infra-orchestration` | Cross-repo |
| Sync terraform inventory | `/sync-inventory` | `infra-orchestration` | Outputs |
| E2E pipeline test | `/test-e2e` | `infra-orchestration` | Full stack |
| Git workflow standards | `/git-workflow-standards` | `git-standards` | Branches |
| PR & issue standards | `/pr-standards` | `git-standards` | PR guards |
| Code quality | `/code-quality-standards` | `code-standards` | Code rules |
| Code review | `/review-standards` | `code-standards` | Review focus |
| Infrastructure | `/infrastructure-standards` | `infra-standards` | IaC standards |
| AgentsMD authoring | `/agentsmd-authoring` | `project-standards` | File structure |
| Workspace management | `/workspace-standards` | `project-standards` | Multi-repo |
| This registry | `/skills-registry` | `project-standards` | Tool lookup |

All plugins sourced from `jacobpevans-cc-plugins`.

## Hook-Only Plugins

| Plugin | Purpose |
| --- | --- |
| `git-guards` | Pre-commit guards for git operations |
| `content-guards` | Content validation hooks |

## Superpowers Skills

| Intent | Skill | Notes |
| --- | --- | --- |
| Receive code review | `superpowers:receiving-code-review` | After comments |
| Request code review | `superpowers:requesting-code-review` | Before merge |
| Verify completion | `superpowers:verification-before-completion` | Before "done" |
| TDD workflow | `superpowers:test-driven-development` | Features/bugfixes |
| Debug systematically | `superpowers:systematic-debugging` | Bugs/failures |
| Finalize branch | `superpowers:finishing-a-development-branch` | Ready for review |
| Brainstorm | `superpowers:brainstorming` | Before features |
| Write plans | `superpowers:writing-plans` | Multi-step planning |
| Execute plans | `superpowers:executing-plans` | Separate context |
| Parallel agents | `superpowers:dispatching-parallel-agents` | 2+ tasks |
| Find superpowers | `superpowers:using-superpowers` | Discover skills |
| Multi-agent dev | `superpowers:subagent-driven-development` | Plans + agents |
| Create/edit skills | `superpowers:writing-skills` | Skill dev |
| Git worktrees | `superpowers:using-git-worktrees` | Feature isolation |
| Interactive CLI | `superpowers:using-tmux-for-interactive-commands` | vim, rebase -i |

## Task Agents & Plugins

| Intent | Name | Type | Notes |
| --- | --- | --- | --- |
| Review a PR | `pr-review-toolkit` | plugin | Multi-agent review |
| Review code | `code-reviewer` | agent | Confidence-scored |
| Resolve PR threads | `pr-thread-resolver` | agent | After comments |
| Fix CI failures | `ci-fixer` | agent | Fix CI on PRs |
| Implement issues | `issue-resolver` | agent | For shaped issues |
| Review documentation | `docs-reviewer` | agent | Markdown validation |

## Related Skills

- **agentsmd-authoring** (project-standards) — Use when editing agentsmd files, creating skills/agents/rules, or working in ai-assistant-instructions
- **workspace-standards** (project-standards) — Use when setting up or managing multi-repo workspaces
