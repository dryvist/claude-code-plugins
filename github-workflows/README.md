# github-workflows

Claude Code plugin for PR management and issue shaping with Shape Up methodology.

See [ARCHITECTURE.md](ARCHITECTURE.md) for integration diagrams and the master ship pipeline.

## Skills

- **`/ship`** - Full automation: commit, push, create PR(s), and auto-finalize in one command.
- **`/finalize-pr`** - Finalize PRs for merge: single PR, all repo PRs (`all`), or all org PRs (`org`). Includes bot-authored PRs in all modes.
- **`/refresh-repo`** - Check PR merge-readiness, sync local repo, and cleanup stale worktrees
- **`/rebase-pr`** - Merge a PR using local git rebase + signed commits + push to main
- **`/squash-merge-pr`** - Validate PR readiness and squash merge into main (errors if not ready)
- **`/resolve-pr-threads`** - Orchestrate resolution of PR review threads (requires superpowers plugin)
- **`/gh-cli-patterns`** - Canonical reference for gh CLI command shapes used by other skills in this plugin
- **`/shape-issues`** - Shape raw ideas into actionable GitHub Issues using Shape Up methodology
- **`/trigger-ai-reviews`** - Trigger Claude, Gemini, and Copilot reviews on a PR
- **`/shared-workflow-org-refs`** - Literal current-owner `uses:` references for reusable workflows; shared-CI homes under dryvist

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
/refresh-repo             # PR check, sync, worktree cleanup
/rebase-pr                # Rebase-merge current branch
/rebase-pr 42             # Rebase-merge specific PR by number
/squash-merge-pr          # Validate and squash merge
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
