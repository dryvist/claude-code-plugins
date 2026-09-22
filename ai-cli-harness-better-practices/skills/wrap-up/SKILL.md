---
name: wrap-up
description: "End-of-session handler that first checks whether the current session's plan is actually complete. If complete: run a quick retrospective, emit a forward-looking follow-up prompt, and — in a git repository — refresh the repo and clean gone branches. If incomplete: skip cleanup and emit ready-to-paste resume prompts so the unfinished work can be picked up cold in a new session. The completion verdict and forward artifact work outside a repository; only the cleanup steps need one."
---

# Post-Session Wrap-Up

> **State warning**: TaskList contents, plan checklist state, and any branch or
> remote-tracking state all change between invocations. Re-gather them from Step
> 0; never trust prior outputs from this conversation.

`/wrap-up` has two paths. Step 0 decides which one runs.

| Step 0 outcome           | Path                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| Plan complete OR no plan | **Path A** — retrospective + follow-up prompt; plus repo refresh and branch cleanup when in a repository |
| Plan incomplete          | **Path B** — emit resume blocks; skip Path A cleanup entirely     |

The `purge-pr` focused mode (bottom of this file) bypasses Step 0 entirely.

## Delegate the bulk read

Everything this skill reads before it decides is token-heavy and reasoning-light:
the `/session-status` report, the `origin/main..origin/develop` promotion log, the
open-PR listing, and the remaining plan/TaskList items Path B groups. Hand that
raw material to the **router** via the `local-subagents` skill (ai-delegation)
at the cheapest capable tier — alias `cheap`, or a subagent carrying an explicit
lower `model:` when the input is longer than one call holds. The premium lead
makes the Path A/Path B verdict over the returned table, never the raw dump.

Cap the input: at most 30 promotion-log lines and 30 PRs. Truncate, do not
paginate. Exact small-model prompt text:
[references/path-b-and-purge-pr.md](references/path-b-and-purge-pr.md#small-model-extraction-prompt).

**Fallback (verbatim from `local-subagents`)**: none of the router's failure
paths authorize a silent fallback. "Absorbing the work back into your own
context without saying so is the exact cost delegation was meant to avoid, and
it hides the failure from whoever pays for it." If the router is unreachable, do
the step yourself and **say so in the Wrap-Up Summary**. Never silently skip it.

The completion verdict itself is never delegated — that is the judgment this
skill exists to make.

## Step 0: Determine session state

Invoke the `/session-status` skill to analyze the plan checklist, TaskList state, and gather unfinished work and issues.

Determine the completion outcome based on `/session-status`'s report:

- **Path A** (complete): Every TaskList task is complete (or empty), AND
  every plan-file checklist item is checked or complete (or no plan file exists).

  *Additional Git Flow Requirement* — **repository only**. Establish that first:

  ```bash
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || echo "not a repository"
  ```

  Outside a repository, skip this requirement entirely; completion is decided by
  the TaskList and plan checklist alone.

  Inside one, determine whether this is a git-flow repo (default branch
  `develop`). Run this as **one block** — the resolution and its use must share a
  shell (see
  [ARCHITECTURE.md](../../ARCHITECTURE.md#resolving-the-default-branch)) — and
  take exactly one of three branches; this gate must never fail open:

  ```bash
  default_branch=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)
  default_branch=${default_branch#origin/}
  [ -n "$default_branch" ] || default_branch=$(
    gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null)

  if [ -z "$default_branch" ]; then
    echo "BLOCKED: default branch unresolved; cannot confirm promotion state"
  elif [ "$default_branch" = develop ]; then
    git fetch origin --force develop main &&
      git log --oneline origin/main..origin/develop
  else
    echo "trunk repo — promotion requirement does not apply"
  fi
  ```

  `refs/remotes/origin/HEAD` is unset in fetch-based and CI checkouts, so the
  first branch is reachable in practice; treat it as **unknown, not clean**. The
  plan is incomplete until promotion state is positively confirmed.

  When the log shows commits, they MUST be promoted to `main` via
  `/promote-release`. Until then the plan is **incomplete** and the session must
  not follow Path A.
- **Path B** (incomplete): Any TaskList task or plan checklist item
  remains incomplete.

---

## Path A — Clean wrap-up (plan complete or absent)

Steps A1 and A3 are **repository cleanup** and only run when the cwd is a
repository. Gate them:

```bash
git rev-parse --is-inside-work-tree >/dev/null 2>&1
```

When that fails, skip A1 and A3, note "no repository at this cwd; cleanup
skipped" in the summary, and run A2, A2.5, and A4 as normal. Steps A2, A2.5, and
A4 are the part of a wrap-up that always applies — tracking a follow-up needs a
tracker, not a repository.

In a repository, run Steps A1 and A2 **in parallel** (they are independent).
A2.5 runs after A2, and A3 after both A2.5 and A1 finish. Provide a summary of
actions taken.

### A1. Refresh and Prune Repository (repository only)

Invoke `/refresh-repo` to sync, then `/prune-branches` to delete anything
left with nothing useful:

- Check merge-readiness of any remaining open PRs
- Sync the local default branch with remote (main on trunk repos, develop on git-flow repos)
- Delete stale branches and worktrees — local, remote, or both
- Report repository state

### A2. Quick Retrospective

Invoke `/retrospecting quick` to capture a brief session retrospective. Its git
history analysis is empty outside a repository — the session-log half still
works, so run it either way, but when the repository guard failed, record it in
the summary as "retrospective: session log only, no git history" rather than
reporting a full retrospective.

- Git history analysis (commits, files changed)
- Session efficiency metrics
- Key decisions and outcomes
- Actionable improvements

**Requires**: `claude-retrospective` plugin (external). If not installed, skip this step and note it was skipped.

When the session hit a real failure rather than merely finishing, deepen the
retrospective with `/why` (Five Whys — drill from the symptom to the systemic
cause) and frame the improvement with `/kaizen` (small, incremental, error-proofed
by design). Both are optional passes over the same material, not replacements for
the retrospective.

### A2.5. Record Follow-Ups

Invoke the `track-followups` skill with the triaged buckets from the Step 0 report.
It deduplicates, **creates** each item in the issue tracker or the incident system
of record, and returns the created identifiers.

This runs **before** A3 so the handoff can cite real item URLs instead of
restating work that is now tracked. Follow-ups that are only listed are follow-ups
that get lost.

No follow-up work in the Step 0 report → skip this step and say so.

### A3. Follow-Up Session Prompt

If `/session-status` in Step 0 surfaced follow-up work, invoke the `/handoff`
skill to emit the next-session artifact. Pass it the "Recommended Prompt for Next
Session" and "Session Issues Log" sections from the Step 0 report, plus the
identifiers `track-followups` returned in A2.5, as the source material.

Keep the two tracked-follow-up kinds distinct in the handoff — a tracker task is
work to be done, an incident ticket is operational/incident work — never relabel
one as the other. Items already tracked in A2.5 appear in the handoff as a
one-line reference to their identifier, not as restated work.

`/handoff` produces the two-part artifact — a `## Goal statement` capped under
4000 characters (measured with `wc -m`) plus an unbounded `## Full prompt` — so
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
  Follow-ups filed: <n> tracked (<identifiers>) or "none" or "listed only — <reason>"
  Follow-up prompt: done or skipped
  Git Flow promote: done or N/A
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Path B — Resume blocks (plan incomplete)

Skip Path A entirely. Skipping is intentional: `/prune-branches` deletes stale
worktrees, which would delete the in-flight worktree the user needs to resume
in.

Goal: emit one copy-pasteable, self-contained resume block per coherent
group of remaining work, in dependency order, each carrying a real
`/handoff`-built goal statement — never "continue what you were doing".

Done when: every plan-checklist item still unchecked and every `TaskList`
task not `completed` appears in exactly one block; each block states its
working directory, plan-file path, remaining items with line numbers, and
any referenced PR/issue as a full URL; and the Path B summary table is
printed. Full grouping rules, the block/summary formats, and the worked
example: [references/path-b-and-purge-pr.md](references/path-b-and-purge-pr.md).

---

## Focused Mode: Purge a Specific PR

Invoke as `/wrap-up purge-pr <PR_NUMBER>` to close one PR and atomically
purge all local state for its branch. **Bypasses Step 0 and both paths
above.** Use when you know a PR should be closed (obsolete duplicate,
workaround anti-pattern, abandoned work) and you want the local trace gone
in one operation. Sequence and command shapes:
[references/path-b-and-purge-pr.md](references/path-b-and-purge-pr.md).

## Related Skills

- **handoff** (this plugin) — builds the two-part next-session artifact (goal
  statement under 4000 chars + full prompt) used by Path A Step A3 and Path B Step B2
- **wrap-up-docs** (this plugin) — emits a documentation-catchup prompt for a
  weaker local LLM; run alongside this skill when docs must absorb the
  session's technical changes
- **refresh-repo** (github-workflows) — PR readiness check + default-branch sync (Path A Step A1)
- **prune-branches** (github-workflows) — stale branch and worktree cleanup
  (Path A Step A1); also provides `--sweep` and `--prune-stale` modes
- **track-followups** (this plugin) — routes and actually creates each follow-up
  in the issue tracker or the incident system of record (Path A Step A2.5); never
  opens a GitHub issue
- **troubleshoot-worktree** (git-workflows) — Worktree-removal command shape reused by `purge-pr` mode
- **pr-standards** (git-standards) — Workaround Classification rubric used to decide when `purge-pr` is the right action
- **git-flow-next** (git-workflows) — Dedicated git-flow-next guide, worktree setup, and promotion steps
- **local-subagents** (ai-delegation) — the router mechanics used by "Delegate the bulk read": live model menu, tier choice, and the fallback rule.
