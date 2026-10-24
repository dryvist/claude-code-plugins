# git-workflows

Claude Code plugin for local Git standards and troubleshooting.

For branch creation and PR-branch sync, follow the [Git Town rule](https://github.com/dryvist/ai-llm-prompts/blob/main/auto-ai-agent/instructions/agentsmd/rules/on-demand/git-flow.md).
For PR readiness and rebase-merge workflows, see the `github-workflows` plugin
(`/refresh-repo`, `/rebase-pr`).

Session-continuity skills (`/wrap-up`, `/resume`, `/replan`,
`/session-status`) are **not** in this plugin. They live in
`ai-cli-harness-better-practices` — they are session concerns, not git concerns,
and run with or without a repository.

See [ARCHITECTURE.md](ARCHITECTURE.md) for integration diagrams.

## Skills

- **`/troubleshoot-rebase`** - Diagnose and recover from git rebase failures
- **`/troubleshoot-precommit`** - Troubleshoot pre-commit hook failures and auto-fixes
- **`/troubleshoot-worktree`** - Troubleshoot git worktree, branch, and refname issues
- **`/pre-commit-architecture`** - Canonical pre-commit hook architecture: where hook definitions and shared lint configs live

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/git-workflows
```

## Usage

```text
/troubleshoot-rebase
```

## Dependencies

No plugin is invoked programmatically; every skill here uses `git` directly.
One cross-reference is advisory: `/troubleshoot-worktree` defers to
`superpowers:using-git-worktrees`.

Skills that *did* orchestrate across plugins — including the `/wrap-up` that
used to live here — moved to `ai-cli-harness-better-practices`, and their
dependencies moved with them.

## License

Apache-2.0
