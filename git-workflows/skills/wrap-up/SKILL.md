---
name: wrap-up
description: "End-of-session handler that first checks whether the current session's plan is actually complete. If complete: refresh repo, run quick retrospective, clean gone branches, and emit a forward-looking follow-up prompt. If incomplete: skip cleanup and emit one or more `cd`-into-worktree blocks paired with ready-to-paste resume prompts so the unfinished work can be picked up cold in a new session."
---

# Post-Session Wrap-Up

> **State warning**: Branch state, remote tracking, TaskList contents, and plan
> checklist state all change between invocations. Re-run every git/gh command
> and re-call `TaskList` from Step 0; never trust prior outputs from this
> conversation.

`/wrap-up` has two paths. Step 0 decides which one runs.

| Step 0 outcome           | Path                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| Plan complete OR no plan | **Path A** — refresh repo, retrospective, clean branches, follow-up prompt |
| Plan incomplete          | **Path B** — emit resume blocks; skip Path A cleanup entirely     |

The `purge-pr` focused mode (bottom of this file) bypasses Step 0 entirely.

## Step 0: Determine session state

Invoke the `/session-status` skill to analyze the plan checklist, TaskList state, and gather unfinished work and issues.

Determine the completion outcome based on `/session-status`'s report:

- **Path A** (complete): Every TaskList task is complete (or empty), AND
  every plan-file checklist item is checked or complete (or no plan file exists).

  *Additional Git Flow Requirement*: On Git Flow repositories (default branch is
  `develop`), verify if there are any unpromoted changes on `develop`. Run
  `git fetch origin --force develop main && git log origin/main..origin/develop` to check.
  If there are commits, they MUST be promoted to `main` via `/promote-release`. If they
  have not been promoted, the plan is **incomplete** and the session must not follow Path A
  until `/promote-release` has successfully run.
- **Path B** (incomplete): Any TaskList task or plan checklist item
  remains incomplete.

---

## Path A — Clean wrap-up (plan complete or absent)

Run Steps A1 and A2 **in parallel** (they are independent). Step A3 starts as
soon as Step A1 completes (depends on its remote prune). Step A4 runs after
all prior steps finish. Provide a summary of actions taken.

### A1. Refresh Repository

Invoke `/refresh-repo` to:

- Check merge-readiness of any remaining open PRs
- Sync the local default branch with remote (main on trunk repos, develop on git-flow repos)
- Clean up stale worktrees (merged PRs, `[gone]` remote branches)
- Report repository state

### A2. Quick Retrospective

Invoke `/retrospecting quick` to capture a brief session retrospective:

- Git history analysis (commits, files changed)
- Session efficiency metrics
- Key decisions and outcomes
- Actionable improvements

**Requires**: `claude-retrospective` plugin (external). If not installed, skip this step and note it was skipped.

### A3. Clean Gone Branches

Invoke `/clean_gone` to remove any local branches whose remote tracking branch has been deleted:

- Identify branches marked `[gone]`
- Remove associated worktrees
- Delete the local branches

**Requires**: `commit-commands` plugin (external). If not installed, skip this step and note it was skipped.

### A4. Follow-Up Session Prompt

If `/session-status` in Step 0 surfaced follow-up work, invoke the `/handoff`
skill to emit the next-session artifact. Pass it the "Recommended Prompt for Next
Session", "Recommended GitHub Issues", and "Session Issues Log" sections from the
Step 0 report as the source material.

`/handoff` produces the two-part artifact — a `## Goal statement` capped under
4000 characters (measured with `wc -c`) plus an unbounded `## Full prompt` — so
the follow-up carries a real goal that pastes into `/goal`, not just a task list.
This closes the long-standing gap where wrap-up emitted a prompt with no goal and
no character budget.

If no follow-up items are found in the `/session-status` report, state that
explicitly — do not fabricate work, and do not invoke `/handoff`.

### Path A Summary

```text
Wrap-Up Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Plan:             <path or "none">
  Plan status:      complete
  Refresh:          done or skipped
  Retrospective:    done or skipped
  Branch cleanup:   done or skipped
  Follow-up prompt: done or skipped
  Git Flow promote: done or N/A
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Path B — Resume blocks (plan incomplete)

Skip Path A entirely. Skipping is intentional: `/refresh-repo` prunes stale
worktrees, which would delete the in-flight worktree the user needs to resume
in.

### B1. Group remaining items

Use the remaining items identified by `/session-status` (plan checklist items still
unchecked + `TaskList` tasks with `status != "completed"`) and group them with
judgement, not by repo alone:

- Items touching the same repo AND sharing one coherent goal → **one block**
- Items touching the same repo but addressing unrelated concerns → **separate
  blocks**, so a fresh session is not polluted by an unrelated thread
- Items touching different repos → **separate blocks**
- If block X must finish before block Y can start, order X first and record
  the dependency on Y's header

For each block, resolve the working directory:

1. If the block's tasks name file paths inside a worktree, use that worktree
   root (`git -C <path> rev-parse --show-toplevel`).
2. Otherwise, derive from the plan file's "Files to Change" / "File to modify"
   section.
3. Last resort: the cwd at wrap-up time.

### B2. Emit each block

Print blocks in dependency order. Each block must be copy-pasteable into a
fresh terminal + new Claude session and runnable cold — the new session sees
none of this conversation.

For each block, invoke the `/handoff` skill to build the resume prompt, scoped to
that block's remaining items and worktree. `/handoff` guarantees the block carries
a `## Goal statement` (capped under 4000 chars, measured with `wc -c`) alongside
the full prompt — so each resumed block re-enters with a real goal, not a bare
task list. The per-block fields below are what you feed `/handoff` as source.

```text
Resume Block N of M — <short label>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Working dir:
  cd <absolute worktree path>

Resume prompt:
──────────────────────────────
<Self-contained prompt for this block. Must include:
 - Plan file path so the new session can re-enter plan mode against it:
   ~/.claude/plans/<slug>.md (use the resolved absolute path emitted by the
   plan-mode system reminder, not this literal example)
 - Exact remaining checklist items with plan-file line numbers
 - Any TaskList task IDs still pending and their subjects
 - Relevant file paths from the plan
 - Full URLs for any referenced PR or issue (e.g.
   https://github.com/<owner>/<repo>/pull/123) — never a bare #123
 - One-line "already done this session" so the new session does not redo work>
──────────────────────────────

Depends on: <block id, or "none">
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The resume prompt restates the goal explicitly. It must never say "continue
what you were doing" or reference "this session" — the new session has no
memory of it.

### Path B Summary

After all resume blocks, print:

```text
Wrap-Up Summary (incomplete)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Plan:             <plan-file path or "none">
  Plan status:      incomplete (<n> open checklist items, <m> open TaskList items)
  Refresh:          skipped — plan incomplete
  Retrospective:    skipped — plan incomplete
  Branch cleanup:   skipped — plan incomplete
  Resume blocks:    <count>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Focused Mode: Purge a Specific PR

Invoke as `/wrap-up purge-pr <PR_NUMBER>` to close one PR and atomically
purge all local state for its branch. **Bypasses Step 0 and both paths above.**
Use when you know a PR should be closed (obsolete duplicate, workaround
anti-pattern, abandoned work) and you want the local trace gone in one
operation.

Sequence:

1. **Capture the branch name first** — step 2 deletes the remote ref, so
   capture before that runs:
   `gh pr view <PR_NUMBER> --repo <owner>/<repo> --json headRefName --jq '.headRefName'`.
2. Close the PR and delete the remote branch in one call:
   `gh pr close <PR_NUMBER> --repo <owner>/<repo> --comment "<reason>" --delete-branch`.
3. If the current worktree IS the captured branch's, switch to the repo's
   default branch first (`gh repo view --json defaultBranchRef --jq
   '.defaultBranchRef.name'`, then `git switch <that branch>`) so step 4 can
   remove it.
4. Find the worktree path via `git worktree list` matching the captured
   branch, then `git worktree remove <path>` if present, and
   `git branch -D <branch>`.

Closes the gap where `gh pr close --delete-branch` removes only the remote
branch and leaves the local branch + worktree behind. Reuses the
worktree-removal command shape from `/troubleshoot-worktree` and aligns with
`/clean_gone`'s post-removal state.

## Related Skills

- **handoff** (git-workflows) — builds the two-part next-session artifact (goal
  statement under 4000 chars + full prompt) used by Path A Step A4 and Path B Step B2
- **refresh-repo** (github-workflows) — PR readiness check + repo sync +
  worktree cleanup (Path A Step A1 dependency); also provides `--sweep` and
  `--prune-stale` modes
- **shape-issues** (github-workflows) — Shape and create well-structured GitHub issues
- **troubleshoot-worktree** (git-workflows) — Worktree-removal command shape reused by `purge-pr` mode
- **pr-standards** (git-standards) — Workaround Classification rubric used to decide when `purge-pr` is the right action
- **git-flow-next** (git-workflows) — Dedicated git-flow-next guide, worktree setup, and promotion steps
