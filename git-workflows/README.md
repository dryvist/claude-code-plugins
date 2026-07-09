# git-workflows

Claude Code plugin for main branch synchronization, troubleshooting, and post-merge cleanup.

For worktree creation, use `superpowers:using-git-worktrees` guided by
`.claude/rules/worktree-conventions.md`. For PR refresh and rebase-merge workflows, see the
`github-workflows` plugin (`/refresh-repo`, `/rebase-pr`).

See [ARCHITECTURE.md](ARCHITECTURE.md) for integration diagrams.

## Skills

- **`/sync-main`** - Update the repo's default branch from remote (main, or develop on git-flow repos) and merge into current or all open PR branches (`all`)
- **`/wrap-up`** - Post-merge cleanup: refresh repo, quick retrospective, clean gone branches
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
/wrap-up                  # Post-merge cleanup + retrospective
```

## Dependencies

| Skill | Requires | Why |
|-------|----------|-----|
| `/wrap-up` | `github-workflows` plugin | Invokes `/refresh-repo` for repo sync after merge |
| `/wrap-up` | `claude-retrospective` plugin | Invokes `/retrospecting quick` for session retrospective |
| `/wrap-up` | `commit-commands` plugin | Invokes `/clean_gone` for branch cleanup |

## License

MIT
