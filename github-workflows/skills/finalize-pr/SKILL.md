---
name: finalize-pr
description: >-
  Automatically finalize pull requests for merge by resolving CodeQL violations,
  review threads, merge conflicts, and CI failures. Handles single PR (current
  branch or by number), all open PRs in the repo, or all open PRs across the org.
  Includes bot-authored PRs in all modes.
metadata:
  argument-hint: "[PR_NUMBER | all | org]"
---

# Finalize PR

**FULLY AUTOMATIC** - Fully automates PR finalization: monitor, fix, prepare for merge. Assumes PR already exists.
No manual intervention required. For manual review-focused workflows, use `/review-pr`.

> **State warning**: Automated reviewers (CodeQL, Copilot, AI reviews) post
> asynchronously. CI may have re-run. Merge conflicts may have appeared.
> Re-fetch live PR state from Step 1.

## Critical Rules

1. **Verify all checks pass via Phase 3 gate** - Re-run Phase 3 against live API on every
   invocation; "mergeable" means git-conflict-free only, not fully unblocked.
2. **Resolve all conversations** - Automatically invoke `/resolve-pr-threads` for review threads
3. **Fix all CodeQL violations** - Check repository and automatically fix using `/resolve-codeql`
4. **Simplify all code changes** - Invoke /simplify at Step 2.3.5 (after all fixes). Pre-push simplification is handled by `/ship`.
5. **Validate locally before pushing** - Run project linters and tests
6. **Monitor CI early, block last** - Start CI monitoring in background immediately, but fix other issues while it runs
7. **Update PR metadata automatically** - Before reporting ready, update title, description, and linked issues via haiku subagent
8. **Take direct action** - Identify issues and fix them automatically
9. **Include bot PRs** - Never filter by author. All modes include dependabot, release-please, claude, github-actions, etc.
10. **Never cross org boundaries** - Org mode derives owner from current repo only
11. **Git Flow Promotion** - For Git Flow repositories, after merging the PR into `develop` and validating it, you must ensure a release promotion to `main` is
    triggered via `/promote-release` as a mandatory, non-optional step. You must add this task to the active session checklist.

## Phase 1: PR Discovery and Targeting

Steps 1.1–1.4 run sequentially.

### 1.1 Parse Argument

| Argument | Mode | Target |
|---|---|---|
| _(none)_ | Current branch | Single PR on current branch |
| `42` | Single PR | PR #42 |
| `all` | Repo-wide | All open PRs in current repo |
| `org` | Org-wide | All open PRs across all repos in current org |

### 1.2 Discover PRs

- **Single/current-branch**: Resolve PR number from current branch, proceed to Phase 1.5.
- **Repo-wide (`all`)**: List all open PRs (limit 50) with number, title, author, headRefName.
- **Org-wide (`org`)**: Enumerate repos, list open PRs per repo (limit 50 each, 50 total cap), include `repository` field.

### 1.3 Tag Bot PRs

Tag PRs where `author.login` ends with `[bot]` for reporting. Process identically to human PRs.

### 1.4 Confirm Batch (Multi-PR Only)

Display discovery list before proceeding. Verify working tree is clean (if dirty, ask user to commit/stash). Note current branch for restoration.

## Phase 1.5: Build Context Brief (if not provided)

If invoked via `/ship`, a context brief is already in session context — skip this step.

If invoked standalone, build a lightweight brief from:

1. PR description: `gh pr view <PR_NUMBER> --json body --jq '.body'`
2. Commit log relative to PR base: `BASE=$(gh pr view <PR_NUMBER> --json baseRefName --jq '.baseRefName') && git log --oneline origin/$BASE..HEAD`

Synthesize purpose, key changes, and intentional patterns into a 5-10 line block.
This informs `/resolve-pr-threads` (Phase 2.2) when evaluating reviewer feedback.

## Phase 2: Resolution Loop (AUTOMATIC)

**Execution strategy**: Start CI monitoring in the background (Step 2.1) and
fix all other issues in parallel while CI runs. Never block on CI when other
work is available. Pre-push simplification is handled by `/ship`; within this
skill, /simplify runs once at Step 2.3.5 after all fixes are applied.

_For multi-PR modes, Phases 2-5 execute once per PR in sequence. Check out each PR branch at the
start of each iteration. For org-wide mode, use `repository.nameWithOwner` from Phase 1 as the
`--repo` argument when checking out._

Steps 2.1 and 2.2 start concurrently (2.1 is non-blocking). Steps 2.3 and 2.4 run sequentially after 2.2.

### 2.1 Start CI Monitoring (BACKGROUND)

Launch CI monitoring in a background Task agent (`run_in_background: true` on the Task tool).
Monitor CI checks using `--watch` so the agent blocks until all complete.

Do NOT wait for the agent to finish — proceed to 2.2 immediately.

### 2.2 Parallel Fixes

Run these checks simultaneously. Launch independent fixes in parallel via
Task agents when they touch different files. Invoke `superpowers:dispatching-parallel-agents` for dispatch patterns.

#### CodeQL Violations

Run the **canonical code-scanning alert count** from /gh-cli-patterns.
Replace `<OWNER>` and `<REPO>` per the placeholder convention in that skill.

**If violations found**: Invoke `/resolve-codeql fix`, validate locally.

#### Review Threads

Invoke `/resolve-pr-threads`. It exits cleanly when no threads exist.
After completion, validate locally.

#### Merge Conflicts

Check if the PR has git conflicts (`mergeable` field). **`mergeable: MERGEABLE` means no git
conflicts only** — it does NOT mean the PR is fully ready to merge. **If conflicts**: Fetch the
PR's base branch (`gh pr view <PR_NUMBER> --json baseRefName --jq '.baseRefName'` — `develop` on
git-flow repos, `main` on trunk repos or promotion PRs), attempt merge, report unresolvable
conflicts for user. After resolution, validate locally. Full
readiness verification (including `mergeStateStatus`, CI, CodeQL, review decision, threads) happens
in Phase 3.

### 2.3 CI Failure Fixes

Check background CI results from 2.1:

- **All passing**: Proceed to Phase 3
- **Failures**: Fetch failed run logs, fix locally, validate, commit and push.
  Restart background CI monitoring and loop back to 2.2 if new issues emerged.

### 2.3.5 Final Simplification

After all fixes from 2.2 and 2.3 are complete, invoke /simplify once on all
cumulative changes. This is the single /simplify pass within `/finalize-pr` —
it catches any code introduced by fix iterations (CodeQL fixes, CI fixes,
review thread implementations) that wasn't part of the original pre-push
simplification. If /simplify produces changes, validate locally, commit,
and push before proceeding to 2.4.

### 2.4 Health Check

Verify final PR state, mergeability, and check status. If fixes introduced new issues, loop back to 2.2.

## Phase 3: Pre-Handoff Verification

> ⛔ **NO SHORT-CIRCUIT — EVERY INVOCATION, EVERY TIME.**
> Run this gate against live API state now, even if this PR was verified
> 30 seconds ago. Subagent self-reports and prior in-session messages are
> historical snapshots, not current truth. The world changes: CodeQL
> completes async, required reviewers post async, Renovate force-pushes,
> branch protection re-evaluates. Re-run every query below.

### 3.1 PR State Gate (GraphQL — re-run now)

Run the **canonical PR-readiness gate** from /gh-cli-patterns against
`<PR_NUMBER>`. Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>` per the placeholder convention in
that skill.

**Required values — if any fail, return to Phase 2:**

| Field | Required | Abort message |
|-------|---------|---------------|
| `state` | `OPEN` | "PR is not open" |
| `mergeable` | `MERGEABLE` | "PR has git conflicts — rebase/merge in Phase 2" |
| `mergeStateStatus` | `CLEAN` or `HAS_HOOKS` | "PR merge state is `{value}` — blocked, return to Phase 2" |
| `isDraft` | `false` | "PR is a draft — mark ready for review first" |
| `reviewDecision` | `APPROVED` or `null` | "Review decision is `{value}` — changes requested or required" |
| `statusCheckRollup.state` | `SUCCESS` | "CI rollup is `{state}` — fix failures in Phase 2" |
| All `reviewThreads.isResolved` | `true` | "Unresolved threads — run `/resolve-pr-threads`" |
| `reviewThreads.pageInfo.hasNextPage` | `false` | "More than 100 threads — paginate manually and re-verify" |

> **`mergeStateStatus` values that are NOT ready:** `BEHIND` (needs rebase),
> `BLOCKED` (branch protection — could be required review, CodeQL, or required
> status check), `DIRTY` (conflicts), `DRAFT`, `UNKNOWN` (GitHub computing),
> `UNSTABLE` (checks failed or pending). Any of these = return to Phase 2.

### 3.2 CodeQL Gate (REST — separate from CI, re-run now)

`statusCheckRollup` does NOT include CodeQL alert state. Run the **canonical code-scanning
alert count** from /gh-cli-patterns. Replace `<OWNER>` and `<REPO>` per the
placeholder convention.

**Required**: Result must be `0`. Any open CodeQL alerts → return to Phase 2,
invoke `/resolve-codeql fix`.

### 3.3 Code and Local Validation

- ✅ Code simplified: `/simplify` ran at Phase 2.3.5 on all changes
- ✅ Local linters pass: validators ran in Phase 2

**Only if all three gates (3.1, 3.2, 3.3) pass**: Proceed to Phase 3.4.

### 3.4 Human-Review Decision (main-targeted PRs only)

Applies **only when the PR's `baseRefName` is `main`** — a trunk-repo PR or a
`develop`→`main` promotion. A PR into `develop` on a git-flow repo is always
AI-initiated; skip this step for it.

This is the sanctioned moment to ask for a human (see pr-standards, git-standards
→ Human-Review Gate). With CI, CodeQL, and threads clean, judge whether the change
should still have human eyes before it merges to `main` — you are not confident
enough, or merging would take an externally-visible action (e.g. cut a release) you
are not authorized to trigger. If so, request review instead of proceeding:

```bash
gh pr edit <PR_NUMBER> --add-label "human:review"
```

Then record the PR as `needs-human` in Phase 5 (reason: `human:review`), not
`ready`. High confidence plus thorough validation still lets you proceed to Phase 4
and hand off a mergeable PR — the label is opt-in, never required.

**Multi-PR handling**: If a PR needs human intervention (unresolvable conflict,
unrecoverable CI failure, etc.), log it with reason and continue to the next PR.
Do not stop the batch for one blocked PR.

## Phase 4: Update PR Metadata

Delegate to a **haiku subagent** to keep full diff out of main context.
Steps 4.1 and 4.2 run sequentially within the agent. Step 4.3 runs after both.

### 4.1 Update PR Title and Description

1. Summarize branch history and diff stats against the PR's base branch; read current PR title and body.
2. Generate updated title (conventional commit format, <70 chars) and description with sections:
   **Summary**, **Changes**, **Test Plan**.

### 4.2 Link Related Issues and PRs

1. Extract keywords from branch name and commit messages.
2. Search GitHub issues and PRs for related items (limit 5 each).
3. Add `Closes #X` (directly related issues) or `Related: #X` (adjacent PRs) — no guessing.
4. If the branch name, commits, or existing PR body already name a Zammad
   ticket (`#NNNNN`, `Zammad #NNNNN`, or a `$ZAMMAD_URL/#ticket/zoom/<id>`
   link), preserve it in the regenerated body as `Zammad: <full ticket URL>`.
   Do not search Zammad for new matches here — only carry forward a reference
   that already exists in this PR's own history.

### 4.3 Apply Updates

After 4.1 and 4.2 complete, apply title and body together — no temp files.
Use the heredoc body pattern from /gh-cli-patterns:

```bash
gh pr edit <PR_NUMBER> --title "generated title" --body "$(cat <<'EOF'
... generated body ...
EOF
)"
```

Single-quoted `'EOF'` prevents shell expansion. Closing `EOF` must be alone on its own line with no leading whitespace.

Proceed to Phase 5.

## Phase 5: Record Result

**Single/current-branch mode**: Emit the **Canonical PR Status Summary** (Section 1 =
this PR, Section 2 = all open PRs in current repo) as defined in /gh-cli-patterns,
titled `PR Status`.

**Multi-PR mode**: Record the per-PR result (ready / blocked / needs-human). Restore the original
branch and continue to the next PR. Do NOT emit a ready report — that happens in Phase 6.

## Stop Condition

MUST NOT return until ALL conditions pass for EVERY targeted PR:
CI green, CodeQL clean, threads resolved, no conflicts, code simplified, local linters and tests pass, metadata updated.
If ANY fails, loop back to Phase 2. CRITICAL: CodeQL is SEPARATE from CI — check both independently.

## Phase 6: Aggregate Report (Multi-PR Only)

Emit the **Canonical PR Status Summary** as defined in /gh-cli-patterns, titled
`Finalization Summary`. Section 1 = all PRs processed this run. Section 2 = all open
PRs in affected repos (current repo for `all` mode; all repos from Phase 1 discovery
for `org` mode). Show the target repo as a label next to each merge command (no `--repo` flag; user
runs from the correct worktree).

## Workflow

Use ONLY after a PR exists. Phases: 1 (discover) → 1.5 (context brief) →
2 (fix loop) → 3 (verify) → 4 (metadata) → 5 (report ready).
For `all`/`org` modes: Phases 2-5 loop per PR, Phase 6 aggregates results.

## Related Skills

- squash-merge-pr (github-workflows) — squash merge a PR after finalize-pr reports ready
- resolve-pr-threads (github-workflows) — invoked internally to resolve review threads
- rebase-pr (github-workflows) — alternative merge strategy after finalize-pr reports ready
- pr-standards (git-standards) — PR authoring and review standards
- code-quality-standards (code-standards) — code quality guidelines applied during fixes
- gh-cli-patterns (github-workflows) — canonical gh CLI command shapes, placeholder convention, PR gate, code-scanning query
- git-flow-next (git-workflows) — Dedicated git-flow-next guide, worktree setup, and promotion steps
