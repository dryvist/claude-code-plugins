# github-workflows

Claude Code plugin for PR management and issue shaping with Shape Up methodology.

See [ARCHITECTURE.md](ARCHITECTURE.md) for integration diagrams and the master ship pipeline.

## Skills

- **`/ship`** - Full automation: commit, push, create PR(s), and auto-finalize in one command.
- **`/finalize-pr`** - Finalize PRs for merge: single PR, all repo PRs (`all`), or all org PRs (`org`). Includes bot-authored PRs in all modes.
- **`/refresh-repo`** - Check PR merge-readiness and sync the local repo with its default branch
- **`/prune-branches`** - Delete branches and worktrees with nothing useful, local and remote; optional multi-repo sweep
- **`/rebase-pr`** - Recreate a conflicted PR branch on a fresh branch, then arm auto-merge
- **`/merge-pr`** - Validate PR readiness and arm native auto-merge with `gh pr merge --auto`. Merge commit by default,
  `--squash`/`-s` to squash instead. Promotion to main on git-flow repos is daily and automatic; agents do not promote by hand
- **`/pr-stacks`** - Split a large change into an ordered chain of dependent PRs with `gh stack`: layering, cascading rebase, and stack-aware merge
- **`/resolve-pr-threads`** - Orchestrate resolution of PR review threads (requires superpowers plugin)
- **`/gh-cli-patterns`** - Canonical reference for gh CLI command shapes used by other skills in this plugin, including trunk-vs-git-flow default-branch detection
- **`/shape-issues`** - Shape raw ideas into actionable GitHub Issues using Shape Up methodology
- **`/trigger-ai-reviews`** - Trigger Claude, Gemini, and Copilot reviews on a PR
- **`/shared-workflow-org-refs`** - Literal current-owner `uses:` references for reusable workflows; shared-CI homes under dryvist
- **`/github-actions-silent-failures`** - Diagnose GitHub Actions workflows that fail
  silently: zero-job `startup_failure` runs, gh-aw's `.github`-named-repo import bug, and
  self-hosted-runner traps (shared-tmp races, `docker exec` landing as an unprivileged user)

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/github-workflows
```

## Usage

```text
/ship                     # Commit, push, create PR, and auto-finalize
/finalize-pr              # Finalize PR on current branch
/finalize-pr 42           # Finalize specific PR by number
/finalize-pr all          # Finalize all open PRs in repo (including bots)
/finalize-pr org          # Finalize all open PRs across org (including bots)
/refresh-repo             # PR check, default-branch sync
/prune-branches           # Delete dead branches and worktrees
/rebase-pr                # Recreate a conflicted PR branch, then arm auto-merge
/rebase-pr 42             # Recreate a specific conflicted PR, then arm auto-merge
/merge-pr                 # Validate and arm auto-merge (merge commit by default)
/merge-pr 42 --squash     # Validate and arm auto-merge with squash on specific PR
/pr-stacks                # Split a large change into an ordered chain of dependent PRs
/resolve-pr-threads       # Batch resolve review threads
/shape-issues             # Shape ideas into GitHub issues
/trigger-ai-reviews       # Trigger Claude, Gemini, Copilot reviews
```

## Dependencies

| Skill | Requires | Why |
|-------|----------|-----|
| `/ship` | `/simplify` skill | Invokes /simplify pre-push for code cleanup |
| `/resolve-pr-threads` | `superpowers` plugin | Sub-agents invoke `superpowers:receiving-code-review` for review feedback handling |

Install superpowers: `claude plugins add superpowers-marketplace/superpowers`

## License

MIT
