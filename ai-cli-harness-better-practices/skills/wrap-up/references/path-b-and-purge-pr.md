# Path B (incomplete) and purge-pr focused mode

Reference detail for `wrap-up`. Loaded on demand — most invocations take
Path A and never need this file.

## Small-model extraction prompt

Short imperatives, explicit schema, hard STOP — used by "Delegate the bulk
read" in the core skill file:

```text
Extract items from the input. Do not explain. Do not advise. Do not decide.
Output ONLY this table, one row per item:
  item | kind (TASK/CHECKLIST/COMMIT/PR) | state | evidence (line no, SHA, or URL)
Rules:
1. Copy text verbatim. Never paraphrase an item.
2. Unknown field -> write UNKNOWN. Never guess a state.
3. At most 60 rows. STOP after the table.
```

## Path B — Resume blocks (plan incomplete)

Skip Path A entirely. Skipping is intentional: `/prune-branches` deletes stale
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

1. If the block's tasks name file paths inside a repository, use its root —
   `git -C <path> rev-parse --show-toplevel 2>/dev/null`. When that prints
   nothing, `<path>` is not in a repository; fall through to 2.
2. Otherwise, derive from the plan file's "Files to Change" / "File to modify"
   section.
3. Last resort: the cwd at wrap-up time.

### B2. Emit each block

Print blocks in dependency order. Each block must be copy-pasteable into a
fresh terminal + new Claude session and runnable cold — the new session sees
none of this conversation.

For each block, invoke the `/handoff` skill to build the resume prompt, scoped to
that block's remaining items and worktree. `/handoff` guarantees the block carries
a `## Goal statement` (capped under 4000 chars, measured with `wc -m`) alongside
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
`/prune-branches`'s post-removal state.
