---
name: wrap-up
description: "End-of-session cleanup after PR merge: refresh repo, run quick retrospective, clean gone branches, and generate a follow-up session prompt. Combines /refresh-repo, /retrospecting quick, and /clean_gone into a single post-merge workflow, then triages remaining work into a next-session prompt and GitHub issues."
---

# Post-Merge Wrap-Up

> **State warning**: Branch state, remote tracking, and PR status change between
> invocations. Re-run all git/gh commands from Step 1.

Run Steps 1 and 2 **in parallel** (they are independent). Step 3 starts as soon as
Step 1 completes (depends on its remote prune). Step 4 runs after all prior steps finish.
Provide a summary of actions taken.

## Step 1: Refresh Repository

Invoke `/refresh-repo` to:

- Check merge-readiness of any remaining open PRs
- Sync local main with remote
- Clean up stale worktrees (merged PRs, `[gone]` remote branches)
- Report repository state

## Step 2: Quick Retrospective

Invoke `/retrospecting quick` to capture a brief session retrospective:

- Git history analysis (commits, files changed)
- Session efficiency metrics
- Key decisions and outcomes
- Actionable improvements

**Requires**: `claude-retrospective` plugin (external). If not installed, skip this step and note it was skipped.

## Step 3: Clean Gone Branches

Invoke `/clean_gone` to remove any local branches whose remote tracking branch has been deleted:

- Identify branches marked `[gone]`
- Remove associated worktrees
- Delete the local branches

**Requires**: `commit-commands` plugin (external). If not installed, skip this step and note it was skipped.

## Step 4: Follow-Up Session Prompt

After the retrospective completes (or is skipped), generate a follow-up prompt for the next session.

Scan the conversation history in **reverse chronological order**, stopping when no new items appear for ~10 consecutive messages.

Most unfinished work surfaces near the end of a session.

### 4a + 4b: Gather Unfinished Work and Session Issues (parallel)

Scan simultaneously for both categories:

**Unfinished work** (4a):

- **Incomplete tasks** — anything started but not finished, or marked as TODO/FIXME during this session
- **Items needing production-readiness** — code that works but needs hardening, tests, error handling, or documentation before it is production-ready
- **Future work identified** — any issues, improvements, or ideas called out during the session as "later", "follow-up", "out of scope", or similar

**Session issues** (4b):

- Errors (build failures, test failures, runtime errors)
- Warnings (linter warnings, deprecation notices, compiler warnings)
- Flaky or unreliable behavior observed
- Workarounds applied that should be properly fixed
- Tool or dependency issues encountered

### 4c: Triage Into Prompt vs GitHub Issues

Split the gathered items into two buckets:

1. **Next-session prompt** — items that are small enough to complete in a single focused session (roughly 1–3 tasks). Combine related items where possible.
2. **GitHub issues** — everything else. Before recommending new issues:
   - Search existing open issues with `gh issue list --state open` for duplicates
   - If a matching issue exists, recommend updating it instead of creating a new one
   - Consolidate related items into a single issue when they share a root cause
   - Each recommended issue should include a clear title, description, and acceptance criteria

### 4d: Output the Follow-Up Prompt

Present the results in this format:

```text
Follow-Up Session Prompt
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Recommended prompt for next session:
──────────────────────────────
<A ready-to-paste prompt covering the 1–3 quick-win tasks identified above. Be specific: reference file paths, function names, error messages, etc.>
──────────────────────────────

Recommended GitHub Issues:
──────────────────────────────
1. <Title> — <one-line summary> [new | update #123]
2. <Title> — <one-line summary> [new | update #456]
   ...
──────────────────────────────

Session Issues Log:
──────────────────────────────
- <error/warning/issue encountered, with context>
- ...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If no follow-up items are found, state that explicitly — do not fabricate work.

## Focused Mode: Purge a Specific PR

Invoke as `/wrap-up purge-pr <PR_NUMBER>` to close one PR and atomically
purge all local state for its branch. Skips Steps 1–4 above. Use when you
know a PR should be closed (obsolete duplicate, workaround anti-pattern,
abandoned work) and you want the local trace gone in one operation.

Sequence:

1. `gh pr close <PR_NUMBER> --repo <owner>/<repo> --comment "<reason>" --delete-branch`
2. Resolve the branch's local worktree path from `git worktree list`. If
   present, `git worktree remove <path> --force`.
3. `git branch -D <branch>` to delete the local branch.

Closes the gap where `gh pr close --delete-branch` removes only the remote
branch and leaves the local branch + worktree behind. Reuses the
worktree-removal command shape from `/troubleshoot-worktree` and aligns with
`/clean_gone`'s post-removal state.

## Related Skills

- **refresh-repo** (github-workflows) — PR readiness check + repo sync + worktree cleanup (Step 1 dependency); also provides `--sweep` and `--prune-stale` modes
- **shape-issues** (github-workflows) — Shape and create well-structured GitHub issues
- **troubleshoot-worktree** (git-workflows) — Worktree-removal command shape reused by `purge-pr` mode
- **pr-standards** (git-standards) — Workaround Classification rubric used to decide when `purge-pr` is the right action

## Summary

Report what was completed:

```text
Wrap-Up Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Refresh:          done or skipped
  Retrospective:    done or skipped
  Branch cleanup:   done or skipped
  Follow-up prompt: done or skipped
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
