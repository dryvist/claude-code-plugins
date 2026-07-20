# git-workflows

Claude Code plugin for local git operations: default-branch synchronization,
branching model, and troubleshooting.

For worktree creation, use `superpowers:using-git-worktrees` guided by
`.claude/rules/worktree-conventions.md`. For PR refresh and rebase-merge workflows, see the
`github-workflows` plugin (`/refresh-repo`, `/rebase-pr`).

Session-continuity skills (`/wrap-up`, `/handoff`, `/resume`, `/replan`,
`/session-status`) are **not** in this plugin. They live in
`ai-cli-harness-better-practices` — they are session concerns, not git concerns,
and run with or without a repository.

See [ARCHITECTURE.md](ARCHITECTURE.md) for integration diagrams.

## Skills

- **`/sync-main`** - Update the repo's default branch from remote (main, or develop on git-flow repos) and merge into current or all open PR branches (`all`)
- **`/git-flow-next`** - Work with repositories using the git-flow-next branching model
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
/sync-main
/sync-main all
/troubleshoot-rebase
```

## Dependencies

None. Every skill in this plugin uses `git` directly.

Skills that orchestrate across plugins — including the `/wrap-up` that used to
live here — moved to `ai-cli-harness-better-practices`, and their external
dependencies moved with them.

## License

Apache-2.0
