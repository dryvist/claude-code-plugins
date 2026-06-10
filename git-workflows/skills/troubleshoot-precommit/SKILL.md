---
name: troubleshoot-precommit
description: Troubleshoot pre-commit hook failures and auto-fixes
---

# Pre-Commit Hook Troubleshooting

Diagnose and fix pre-commit hook issues that occur when committing code.

## Error: Pre-Commit Hooks Modified Files

This error looks like:

```text
trim trailing whitespace.................................................Passed
fix end of files.........................................................Passed
markdownlint-cli2........................................................Failed
- hook id: markdownlint-cli2
- files were modified by this hook
```

**What happened:** Pre-commit hooks auto-corrected formatting issues. The fixes weren't committed automatically.

### Why This Happens

Pre-commit hooks run BEFORE your commit. If they auto-fix files, your staged changes no longer
match your working directory. Git stops to let you review the changes.

### Fix: Simple Case

Stage the auto-fixed files and amend the commit:

```bash
git add -A
git commit --amend --no-edit
git push origin <branch>
```

### Fix: Continuing After Rebase

If this happens during a rebase operation:

```bash
# In the worktree where the rebase is running:
git add -A                    # stage the hook changes
git commit --amend --no-edit  # update the current commit in the rebase
git rebase --continue         # continue the rebase
# After the rebase finishes:
git push origin <branch>      # push the rebased branch
```

### Debugging: Hook Loop

If hooks keep modifying files in a loop:

```bash
git diff          # See what changed
git diff HEAD~1   # See what the hook is trying to fix
```

### Common Hooks and What They Fix

| Hook | Fixes |
| --- | --- |
| `trim-trailing-whitespace` | Removes spaces at end of lines |
| `end-of-file-fixer` | Ensures files end with newline |
| `markdownlint-cli2` | Fixes markdown formatting |
| `prettier` | Reformats code/JSON/YAML |
| `eslint` with --fix | Fixes JavaScript/TypeScript issues |

## DO NOT

- Do NOT use `git commit --no-verify` to skip hooks
- Do NOT force-push over hook auto-fixes
- Do NOT assume the hook is wrong - it's usually a legitimate formatting issue

## Related Skills

- **pre-commit-architecture** (git-workflows) — Where hook definitions and shared lint configs live
- **troubleshoot-rebase** (git-workflows) — Diagnose and recover from git rebase failures
- **troubleshoot-worktree** (git-workflows) — Troubleshoot git worktree, branch, and refname issues
