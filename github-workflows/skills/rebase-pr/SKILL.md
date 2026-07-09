---
name: rebase-pr
description: >-
  Local rebase-merge workflow for pull requests with signed commits, pushed
  directly to the PR's base branch. Refuses on git-flow repos when the base
  is main — direct pushes to main are banned there; use /promote-release.
---

# rebase-pr

Merge a PR using local `git rebase` + signed commits + a direct push to the
PR's base branch.

`gh pr merge --rebase` cannot sign commits. Local rebase with `commit.gpgsign=true`
signs every rebased commit. Pushing the base branch directly auto-closes the PR.

This only works where direct pushes to the base branch are allowed: trunk
repos' `main`, or a git-flow repo's `develop`. Git-flow's `main` accepts
merge commits only and never direct pushes — Step 0 refuses before any of
this runs.

## Dispatch

<!--
  WARNING: This skill is executed by a subagent with `bypassPermissions`.
  Ensure all subsequent steps are safe for automatic execution without user prompts.
  Do not add operations that would normally be blocked by DENY rules.
-->

**MANDATORY FIRST STEP**: Spawn a Haiku subagent using the Agent tool with
`mode: "bypassPermissions"`. Pass all content starting from **Prerequisite: Validate Base Branch**
through end-of-document as the agent prompt; include the current branch name and PR number.
Do not execute any steps yourself — the subagent runs the complete workflow autonomously with
all permissions auto-accepted.

If the Haiku subagent cannot be spawned, becomes unavailable, or encounters an unrecoverable
error while running this workflow, clearly report the failure to the user and ask whether to
(a) retry spawning the subagent or (b) proceed manually by following the remaining steps of
this document together step-by-step.

## Prerequisite: Validate Base Branch

Resolve the PR's base branch and the repo's default branch. Replace `<PR_NUMBER>` before running:

```bash
BASE_BRANCH=$(gh pr view <PR_NUMBER> --json baseRefName --jq '.baseRefName')
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')
```

If `BASE_BRANCH == main` AND `DEFAULT_BRANCH == develop` (repo is on git-flow — see
/gh-cli-patterns Canonical Default-Branch Detection), **ABORT**:

> "This is a `develop` → `main` promotion PR on a git-flow repo. Direct pushes to
> `main` are banned there — `main` accepts merge commits only, with no exceptions.
> Run `/promote-release` instead."

Otherwise continue — `BASE_BRANCH` is either a trunk repo's `main` or a git-flow
repo's `develop`, both of which allow this workflow's direct push. Use
`<BASE_BRANCH>` in every step below.

## Prerequisite: Validate Rulesets

Before anything else, check the all-branches ruleset. Replace `<OWNER>` and `<REPO>` before running:

```bash
gh api repos/<OWNER>/<REPO>/rulesets \
  --jq '.[] | select(.conditions.ref_name.include[] == "~ALL") | .rules[].type'
```

**If any of these appear → ABORT with the message shown:**

| Rule type | Message |
|-----------|---------|
| `non_fast_forward` | "Remove from all-branches ruleset. Feature branches need force-push after rebase. Keep restricted to the base branch only." |
| `required_linear_history` | "Remove from all-branches ruleset. Keep restricted to the base branch only." |
| `pull_request` | "Remove from all-branches ruleset. Keep restricted to the base branch only." |
| `required_status_checks` | "Remove from all-branches ruleset. Keep restricted to the base branch only." |
| `code_scanning` | "Remove from all-branches ruleset. Keep restricted to the base branch only." |

Only `required_signatures` belongs on all-branches.

## Step 1: Validate PR Ready

Run the **canonical PR-readiness gate** from /gh-cli-patterns against
`<PR_NUMBER>`. Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>` per the placeholder convention in
that skill.

**Abort if any fail:**

| Field | Must be | Abort message |
|-------|---------|---------------|
| `state` | `OPEN` | "PR is not open — run `/finalize-pr` to fix" |
| `mergeable` | `MERGEABLE` | "PR has merge conflicts — run `/finalize-pr` to fix" |
| `mergeStateStatus` | `CLEAN` or `HAS_HOOKS` | "PR merge state is {value} — run `/finalize-pr` to fix" |
| `isDraft` | `false` | "PR is a draft — mark ready first, then run `/finalize-pr`" |
| `reviewDecision` | `APPROVED` or `null` | "PR needs approval — run `/finalize-pr` to fix" |
| `statusCheckRollup.state` | `SUCCESS` | "CI is not passing: {state} — run `/finalize-pr` to fix" |
| All `reviewThreads.isResolved` | `true` | "Unresolved review threads — run `/finalize-pr` to fix" |
| `reviewThreads.pageInfo.hasNextPage` | `false` | ">100 threads — paginate and re-verify" |

## Step 2: Sync Base Branch

Replace `<BASE_BRANCH>` (from the Prerequisite) before running:

```bash
git fetch origin --force <BASE_BRANCH>
git pull origin <BASE_BRANCH>
```

## Step 3: Fetch Branch, Create Worktree, Rebase

For remote-only branches (Renovate, Dependabot, etc.):

```bash
# NEVER use FETCH_HEAD — always create from origin/{branch}
git fetch origin --force {branch}
git branch {branch} origin/{branch}
```

Work in the PR branch's worktree and rebase. Replace `<BASE_BRANCH>` before running:

```bash
git rebase origin/<BASE_BRANCH>
git log --oneline origin/<BASE_BRANCH>..HEAD   # verify commits are ahead
```

## Step 4: Force-Push and Wait for CI

Replace `<PR_NUMBER>` before running:

```bash
git push --force-with-lease origin {branch}
gh pr checks <PR_NUMBER> --watch --interval 15
```

**Do NOT proceed until all checks pass.**

If force-with-lease fails on a bot branch (no upstream tracking):

```bash
git branch --set-upstream-to=origin/{branch} {branch}
git push --force-with-lease origin {branch}
```

## Step 5: Fast-Forward Merge to Base Branch

Replace `<BASE_BRANCH>` before running (`cd` into that branch's own worktree, not
necessarily a directory literally named `main`):

```bash
cd ../<BASE_BRANCH>
git merge-base --is-ancestor origin/<BASE_BRANCH> {branch}  # verify FF is possible; exit 0 = yes
git merge --ff-only {branch}
```

If `merge-base --is-ancestor` exits non-zero, the base branch moved since rebase — go back to Step 2.

## Step 6: Push Base Branch

Replace `<BASE_BRANCH>` before running:

```bash
git push origin <BASE_BRANCH>
```

If rejected with "Code scanning waiting". Replace `<PR_NUMBER>` and `<BASE_BRANCH>` before running:

```bash
gh pr checks <PR_NUMBER> --watch --interval 15
git push origin <BASE_BRANCH>   # retry after checks pass
```

Verify merged. Replace `<PR_NUMBER>` before running:

```bash
gh pr view <PR_NUMBER> --json state --jq '.state'   # expect: MERGED
```

## Step 7: Cleanup

```bash
git worktree remove {worktree-path}   # remove the merged PR's worktree if one exists
git branch -d {branch}              # use -D only after confirming state=MERGED
git push origin --delete {branch}
git worktree prune
```

## Never Do This

- **NEVER** use `gh pr merge` — GitHub cannot sign rebase commits
- **NEVER** `git push --force origin <BASE_BRANCH>` — only force-push feature branches
- **NEVER** create a local branch from `FETCH_HEAD` — use `origin/{branch}`
- **NEVER** push to the base branch before CI passes on the rebased branch
- **NEVER** skip the GraphQL PR validation check
- **NEVER** use `git branch -D` without first confirming `state=MERGED`
- **NEVER** fix issues inline — if validation fails, abort and suggest `/finalize-pr`
- **NEVER** run this skill's push step against `main` on a git-flow repo — the
  Prerequisite step must have already refused; if it didn't, stop and re-check

## Edge Cases

**Rebase conflicts:**

```bash
# git rebase pauses and lists conflicted files
git status                     # see conflicted files
# edit files to resolve
git add {conflicted-files}
git rebase --continue
```

**Push to base branch rejected (code scanning):**
Wait for CI with `gh pr checks <PR_NUMBER> --watch --interval 15`, then retry push.

**PR already merged:**
Skip Steps 1–6. Go directly to Step 7 cleanup.

**merge-base --is-ancestor exits non-zero:**
The base branch moved while you were waiting for CI. Return to Step 2, re-sync
the base branch, re-fetch branch, re-rebase, force-push again, wait for CI,
then retry merge.

### Pre-Push Hook Auto-Fixes Files

**Detection**: `git push` fails, hook output shows "files were modified by this hook"

**Action**: Commit the auto-fixed files and retry the push:

```bash
git add -A
git commit -m "style: apply pre-push hook auto-fixes"
git push --force-with-lease origin {branch}
```

This commonly occurs with release-please CHANGELOG.md entries that don't conform to markdownlint rules.

## Related Skills

- **squash-merge-pr** (github-workflows) — Squash merge after rebase-pr prepares the branch
- **finalize-pr** (github-workflows) — Full PR finalization pipeline that may invoke rebase-pr
- **promote-release** (github-workflows) — The develop → main merge-commit path this skill refuses to substitute for
- **sync-main** (git-workflows) — Syncs the default branch, often needed before rebasing
- **pr-standards** (git-standards) — PR creation and review standards
- **gh-cli-patterns** (github-workflows) — Canonical gh CLI command shapes, placeholder convention, PR-readiness gate, default-branch detection
