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

1. **Wait for user approval to merge** - Report ready status, then pause for user merge command
2. **Verify all checks pass via Phase 3 gate** - Re-run Phase 3 against live API on every
   invocation; "mergeable" means git-conflict-free only, not fully unblocked.
3. **Resolve all conversations** - Automatically invoke `/resolve-pr-threads` for review threads
4. **Fix all CodeQL violations** - Check repository and automatically fix using `/resolve-codeql`
5. **Simplify all code changes** - Invoke /simplify at Step 2.3.5 (after all fixes). Pre-push simplification is handled by `/ship`.
6. **Validate locally before pushing** - Run project linters and tests
7. **Monitor CI early, block last** - Start CI monitoring in background immediately, but fix other issues while it runs
8. **Update PR metadata automatically** - Before reporting ready, update title, description, and linked issues via haiku subagent
9. **Take direct action** - Identify issues and fix them automatically (except merge decisions)
10. **Include bot PRs** - Never filter by author. All modes include dependabot, release-please, claude, github-actions, etc.
11. **Never cross org boundaries** - Org mode derives owner from current repo only

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

### 2.0 Initialize Iteration Counter (REQUIRED)

Initialize `phase_2_iteration = 0` at first entry to Phase 2 for this PR.
On every re-entry from Phase 3 (gate failure → loop back here), increment by 1
**before** running any 2.1–2.4 step.

**Hard cap: 5 iterations.** On the 6th entry, **DO NOT silently bail**. Instead:

1. Skip all Phase 2 steps for this PR
2. Emit a state dump containing: the last `pr-readiness gate` query result, the
   last code-scanning alert count, the list of unresolved threads (with URLs),
   the last CI rollup state, and the most recent commit SHA on the branch
3. Tag the PR result as `aborted_iteration_cap` with reason "Phase 2 looped 5
   times without reaching a clean Phase 3 — manual intervention required"
4. Exit straight to Phase 5 (report), bypassing Phase 4 metadata updates

This cap exists because some failure modes (e.g., a required human reviewer,
or a CodeQL alert the agent can't auto-fix) are not solvable inside Phase 2.
Looping forever wastes API calls and leaves the user without a clear status.

### 2.1 Start CI Monitoring (BACKGROUND)

Launch CI monitoring in a background Task agent (`run_in_background: true` on the Task tool).
Monitor CI checks using `--watch` so the agent blocks until all complete.

Do NOT wait for the agent to finish — proceed to 2.2 immediately.

**If the background Task agent fails or returns an error** (non-zero exit,
network error, agent-side exception), **DO NOT silently proceed assuming CI
is unknown**. Fall back to direct polling:

```bash
gh pr checks <PR_NUMBER> --watch
```

…with a 10-minute timeout. Log the background-agent failure visibly so the
operator knows a fallback is active. Treat the direct-poll output as the
authoritative CI state for Step 2.3.

### 2.2 Parallel Fixes

Run these checks simultaneously. Launch independent fixes in parallel via
Task agents when they touch different files. Invoke `superpowers:dispatching-parallel-agents` for dispatch patterns.

#### CodeQL Violations

Run the **canonical code-scanning alert count** from /gh-cli-patterns.
Replace `<OWNER>` and `<REPO>` per the placeholder convention in that skill.

**If violations found**: Invoke `/resolve-codeql fix`, validate locally.

**Post-fix verification (REQUIRED — do not skip)**: after `/resolve-codeql fix`
returns, **re-run the canonical alert count** against the same `<OWNER>/<REPO>`.
Expected: a strict decrease from the pre-fix count (typically to zero).

- **If count decreased to 0**: continue to other fixes
- **If count decreased but not to 0**: queue another `/resolve-codeql fix`
  invocation on the next Phase 2 iteration; do not advance to Phase 3 yet
- **If count unchanged**: log "subagent reported success but no state change"
  with both counts. Do NOT loop again in this iteration — increment a local
  `codeql_noop_count`. If `codeql_noop_count >= 2` across iterations, tag the
  PR result as `needs_human` with reason "CodeQL alerts persist after 2
  no-op subagent invocations" and short-circuit to Phase 5.

#### Review Threads

Invoke `/resolve-pr-threads`. It exits cleanly when no threads exist.
After completion, validate locally.

**Post-fix verification (REQUIRED — do not skip)**: after `/resolve-pr-threads`
returns, re-query thread state:

```bash
QUERY='query($owner:String!,$repo:String!,$prNumber:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$prNumber){
      reviewThreads(first:100){nodes{id isResolved}}
    }
  }
}'
gh api graphql -f query="$QUERY" \
  -f owner="<OWNER>" -f repo="<REPO>" -F prNumber=<PR_NUMBER> \
  --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length'
```

Expected: zero unresolved threads, OR strictly fewer than the pre-fix count.

- **Zero unresolved**: continue
- **Decreased but not zero**: queue another iteration
- **Unchanged**: log "subagent reported success but threads unresolved" with
  thread URLs. Track `threads_noop_count` per the CodeQL pattern above.

#### Merge Conflicts

Check if the PR has git conflicts (`mergeable` field). **`mergeable: MERGEABLE` means no git
conflicts only** — it does NOT mean the PR is fully ready to merge. **If conflicts**: Fetch main,
attempt merge, report unresolvable conflicts for user. After resolution, validate locally. Full
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

### 2.6 Wait for In-Flight Async Checks (REQUIRED before Phase 3)

CodeQL, required-reviewer hooks, and some third-party checks complete **async**
after a push. If Phase 3 fires while these are still PENDING, it will see
`statusCheckRollup.state ≠ SUCCESS` and abort — but Phase 2 has nothing to do
in response (the check isn't failing, it just hasn't finished). That creates
a pointless loop that burns iterations and frustrates the user.

Before advancing to Phase 3, **poll until every known check kind has a terminal
state** (SUCCESS, FAILURE, ERROR, CANCELLED, TIMED_OUT, NEUTRAL, SKIPPED, or
ACTION_REQUIRED), OR until 5 minutes pass.

```bash
# Poll loop — exits when no PENDING checks remain, or after 5 minutes
end=$(($(date +%s) + 300))
while [ "$(date +%s)" -lt "$end" ]; do
  pending=$(gh pr checks <PR_NUMBER> --json bucket --jq '[.[] | select(.bucket == "pending")] | length')
  [ "$pending" = "0" ] && break
  sleep 30
done
```

Also separately re-query the code-scanning alert state — CodeQL alerts are
NOT in `pr checks` output:

```bash
gh api 'repos/<OWNER>/<REPO>/code-scanning/alerts?state=open&per_page=100' --jq 'length' || echo "0"
```

**Pending checks are not failures; they are time-passage problems. Wait — don't loop blindly.**

After this poll completes, proceed to Phase 3. Phase 3 may still abort on
genuine failures, and that's correct behavior — but it will never abort just
because something hasn't finished yet.

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

### 3.1.1 Phase 3 Failure Taxonomy (REQUIRED dispatch)

Not every Phase 3 failure should return to Phase 2 — some are unfixable inside
this skill. Dispatch each failed field to one of four handlers:

| Field value | Handler | Action |
|---|---|---|
| `state` = `MERGED` or `CLOSED` | `hard_block_exit_phase_5` | PR has moved out of OPEN state since work began; report and exit |
| `mergeable` = `CONFLICTING` | `fixable_loop_to_phase_2` | Merge-conflict resolution in Phase 2.2 |
| `mergeStateStatus` = `BEHIND` | `fixable_loop_to_phase_2` | Rebase from main in Phase 2.2 |
| `mergeStateStatus` = `DIRTY` | `fixable_loop_to_phase_2` | Same as `CONFLICTING` |
| `mergeStateStatus` = `UNKNOWN` | `wait_and_recheck` | GitHub is recomputing; sleep 30s, re-run Phase 3.1; cap 3 retries |
| `mergeStateStatus` = `UNSTABLE` (a check is FAILURE/ERROR) | `fixable_loop_to_phase_2` | Failure fixes in Phase 2.3 |
| `mergeStateStatus` = `UNSTABLE` (only PENDING checks left) | `wait_and_recheck` | Re-run Phase 2.6 |
| `BLOCKED` + `reviewDecision` = `REVIEW_REQUIRED` | `needs_human_exit_phase_5` | Required reviewer hasn't acted; exit `ready_except_human_gate` |
| `mergeStateStatus` = `BLOCKED` and CodeQL > 0 | `fixable_loop_to_phase_2` | Re-run `/resolve-codeql fix` |
| `mergeStateStatus` = `BLOCKED` for other reasons | `needs_human_exit_phase_5` | Branch protection requires something the AI can't provide |
| `isDraft` = `true` | `needs_human_exit_phase_5` | Marking ready-for-review is a human signal |
| `reviewDecision` = `CHANGES_REQUESTED` | `fixable_loop_to_phase_2` | Re-run `/resolve-pr-threads` |
| `statusCheckRollup.state` = `FAILURE` or `ERROR` | `fixable_loop_to_phase_2` | CI failure fixes in Phase 2.3 |
| `statusCheckRollup.state` = `PENDING` | `wait_and_recheck` | Phase 2.6 should have caught this; re-run 2.6 then 3.1 |
| Any `reviewThreads.isResolved` = `false` | `fixable_loop_to_phase_2` | `/resolve-pr-threads` in Phase 2.2 |

**Handler semantics:**

- `fixable_loop_to_phase_2`: increment `phase_2_iteration`, return to Phase 2 (subject to the iteration cap from Step 2.0)
- `wait_and_recheck`: poll the failing field for up to 5 minutes, then re-evaluate Phase 3 without incrementing the Phase 2 counter
- `needs_human_exit_phase_5`: skip Phase 2 and Phase 4; jump to Phase 5 with
  category `ready_except_human_gate` (if the only blocker is human review or
  draft state) or `needs_human` (other branch protection requirement)
- `hard_block_exit_phase_5`: skip everything; emit terminal report with reason

### 3.2 CodeQL Gate (REST — separate from CI, re-run now)

`statusCheckRollup` does NOT include CodeQL alert state. Run the **canonical code-scanning
alert count** from /gh-cli-patterns. Replace `<OWNER>` and `<REPO>` per the
placeholder convention.

**Required**: Result must be `0`. Any open CodeQL alerts → return to Phase 2,
invoke `/resolve-codeql fix`.

### 3.3 Code and Local Validation

- ✅ Code simplified: `/simplify` ran at Phase 2.3.5 on all changes
- ✅ Local linters pass: validators ran in Phase 2

**Only if all three gates (3.1, 3.2, 3.3) pass**: Proceed to Phase 4 to update PR metadata.

**Multi-PR handling**: If a PR needs human intervention (unresolvable conflict,
unrecoverable CI failure, etc.), log it with reason and continue to the next PR.
Do not stop the batch for one blocked PR.

## Phase 4: Update PR Metadata

Delegate to a **haiku subagent** to keep full diff out of main context.
Steps 4.1 and 4.2 run sequentially within the agent. Step 4.3 runs after both.

### 4.1 Update PR Title and Description

1. Summarize branch history and diff stats against main; read current PR title and body.
2. Generate updated title (conventional commit format, <70 chars) and description with sections:
   **Summary**, **Changes**, **Test Plan**.

### 4.2 Link Related Issues and PRs

1. Extract keywords from branch name and commit messages.
2. Search GitHub issues and PRs for related items (limit 5 each).
3. Add `Closes #X` (directly related issues) or `Related: #X` (adjacent PRs) — no guessing.

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
titled `PR Status`. **Include the result category from the Stop Condition** at the
top of Section 1 — never silently report "ready" when the actual category is one
of the non-ready buckets.

Format the category line precisely:

```text
Result: ready                       — all gates clean, safe for human merge
Result: ready_except_human_gate     — only blocker is required human review (REVIEW_REQUIRED or isDraft)
Result: needs_human                 — branch protection requires AI-unfixable signal: <specific field>
Result: aborted_iteration_cap       — Phase 2 looped 5x; <state dump from Step 2.0 cap>
Result: hard_block                  — PR moved out of OPEN state: <state value>
```

For `ready` or `ready_except_human_gate`, append:

```text
IMPORTANT: Do NOT merge this PR. Wait for the human to review and invoke
  /squash-merge-pr    # Squash all commits into one
  /rebase-pr          # Rebase commits onto main (preserves history)
```

For `needs_human`, `aborted_iteration_cap`, or `hard_block`, append the
specific manual action that would unblock the PR — never a generic "review
manually" suggestion.

**Multi-PR mode**: Record the per-PR result (with category from the Stop Condition).
Restore the original branch and continue to the next PR. Do NOT emit a ready
report — that happens in Phase 6.

## Stop Condition

Use explicit loop logic, not prose interpretation. For each targeted PR, run:

```text
phase_2_iteration = 0
codeql_noop_count = 0
threads_noop_count = 0

loop:
  if phase_2_iteration >= 5:
    return (category=aborted_iteration_cap, state=<dump>)

  run Phase 2.0 - 2.6                         # fix, simplify, wait
  run Phase 3.1 (PR state gate)
  run Phase 3.2 (CodeQL alert count)
  run Phase 3.3 (local validation)

  if all three gates pass:
    run Phase 4 (metadata)
    return (category=ready)

  dispatch each failed field per Phase 3.1.1 taxonomy:
    fixable_loop_to_phase_2  -> phase_2_iteration += 1; continue loop
    wait_and_recheck         -> sleep up to 5 min; goto Phase 3
    needs_human_exit_phase_5 -> return (category=ready_except_human_gate | needs_human)
    hard_block_exit_phase_5  -> return (category=<reason>)
```

**CRITICAL invariants:**

- CodeQL is checked SEPARATELY from `statusCheckRollup` (Phase 3.2 — REST, not GraphQL).
- Subagent self-reports are NOT ground truth. Always re-query live state in Phase 3.
- Pending checks are NOT failures — Phase 2.6 must drain them before Phase 3 runs.
- Subagent "success" claims must be VERIFIED with a follow-up state query (Phase 2.2 post-fix verification).
- Returning `category=ready` requires ALL of: Phase 3.1 passing, Phase 3.2 = 0 alerts, Phase 3.3 validators clean, Phase 4 metadata applied.

Result categories surfaced to Phase 5 / Phase 6:

| Category | Meaning |
|---|---|
| `ready` | All gates clean, metadata updated, safe for human merge |
| `ready_except_human_gate` | Only blocker is `REVIEW_REQUIRED` or `isDraft=true`; AI cannot resolve |
| `needs_human` | Branch protection requires something AI cannot satisfy (e.g., required external status check) |
| `aborted_iteration_cap` | Phase 2 looped 5 times without reaching a clean Phase 3; state dump emitted |
| `hard_block` | PR moved out of OPEN state mid-run |

**MERGE PROHIBITION**: FORBIDDEN from merging, auto-merging, enabling auto-merge, or approving any PR.

## Phase 6: Aggregate Report (Multi-PR Only)

Emit the **Canonical PR Status Summary** as defined in /gh-cli-patterns, titled
`Finalization Summary`. Section 1 = all PRs processed this run. Section 2 = all open
PRs in affected repos (current repo for `all` mode; all repos from Phase 1 discovery
for `org` mode). Show the target repo as a label next to each merge command (no `--repo` flag; user
runs from the correct worktree).
Wait for explicit user merge commands.

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
