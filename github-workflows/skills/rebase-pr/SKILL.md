---
name: rebase-pr
description: >-
  Recreate a conflicted PR branch on a fresh branch with signed commits, then
  land with gh pr merge --auto. Never pushes to the base branch and never
  updates a branch from its base.
---

# rebase-pr

Recover a pull request that has a real merge conflict. Recreate its commits on
a fresh branch cut from the base, with signed commits, then land with
`gh pr merge --auto`.

`commit.gpgsign=true` signs every rebased commit. The fresh branch replaces the
conflicted one; the PR is landed with native auto-merge, never by a direct push
to the base branch.

Nobody updates a PR branch from its base: no `gh pr update-branch`, no merging
the base into the branch, no BEHIND sync. The queue tests the merged result.
Only a real conflict is recreated, on a fresh branch.

## Dispatch

<!--
  WARNING: This skill is executed by a subagent with `bypassPermissions`.
  Ensure all subsequent steps are safe for automatic execution without user prompts.
  Do not add operations that would normally be blocked by DENY rules.
-->

**MANDATORY FIRST STEP**: Spawn a delegate (routing per core AGENTS.md) using the Agent tool with
`mode: "bypassPermissions"`. Pass all content starting from **Prerequisite: Validate Base Branch**
through end-of-document as the agent prompt; include the current branch name and PR number.
Do not execute any steps yourself — the subagent runs the complete workflow autonomously with
all permissions auto-accepted.

If a delegate (routing per core AGENTS.md) cannot be spawned, becomes unavailable, or encounters an unrecoverable
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

> "This is a `develop` → `main` promotion PR on a git-flow repo. Promotion is
> daily and automatic; agents do not promote by hand. Squash and rebase into
> `main` are refused there — `main` accepts merge commits only."

Otherwise continue. Use `<BASE_BRANCH>` in every step below.

> If the PR belongs to a stack, this workflow does not apply. Use
> `/pr-stacks` to manage the stack.

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

## Step 1: Validate PR State

Run the **canonical PR-readiness gate** from /gh-cli-patterns against
`<PR_NUMBER>`. Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>` per the placeholder convention in
that skill.

This skill exists for a real conflict. Confirm the PR is open and conflicted
before recreating it:

| Field | Must be | Abort message |
|-------|---------|---------------|
| `state` | `OPEN` | "PR is not open — nothing to recreate" |
| `mergeable` | `CONFLICTING` | "PR has no real conflict — land it with `/merge-pr` instead" |
| `reviewThreads.pageInfo.hasNextPage` | `false` | ">100 threads — paginate and re-verify" |

A push to a queued PR removes it from the queue. If the PR is in the merge
queue, skip it — do not recreate or push to it. One writer at a time per PR.

## Step 2: Recreate The Branch On A Fresh Branch

Cut a fresh branch from the base and replay the PR's commits onto it with
signed commits. Replace `<BASE_BRANCH>` and `{branch}` before running:

```bash
git fetch origin <BASE_BRANCH>
git switch -c {branch}-recreated origin/<BASE_BRANCH>
git rebase --onto origin/<BASE_BRANCH> origin/<BASE_BRANCH> {branch}
```

Resolve any conflicts as the rebase pauses (see Edge Cases). Keep
`commit.gpgsign=true` so every replayed commit is signed. Then verify the
recreated commits are ahead of `<BASE_BRANCH>`:

```bash
git log --oneline origin/<BASE_BRANCH>..HEAD
```

Never merge the base into the branch and never run `gh pr update-branch`.

## Step 3: Push The Fresh Branch

Push the recreated branch. Replace `{branch}` before running:

```bash
git push -u origin {branch}-recreated
```

If force-with-lease is needed on a bot branch (no upstream tracking):

```bash
git branch --set-upstream-to=origin/{branch}-recreated {branch}-recreated
git push --force-with-lease origin {branch}-recreated
```

Open a ready PR from the fresh branch against `<BASE_BRANCH>` and close the
conflicted PR, referencing the new one. Never open a draft.

## Step 4: Land With Auto-Merge

Land the new PR with native auto-merge. Replace `<PR_NUMBER>` before running:

```bash
gh pr merge <PR_NUMBER> --auto --squash
```

On a merge-queue branch this adds the PR to the queue; elsewhere it arms
auto-merge. Never merge by hand in any other way. Verify the merge state:

```bash
gh pr view <PR_NUMBER> --json mergeStateStatus,autoMergeRequest
```

## Step 5: Cleanup

After the PR is merged, clean up the old conflicted branch and its worktree:

```bash
git worktree remove {worktree-path}   # remove the old PR's worktree if one exists
git branch -d {branch}                # use -D only after confirming state=MERGED
git push origin --delete {branch}
git worktree prune
```

## Never Do This

- **NEVER** push to the base branch — land only with `gh pr merge --auto`
- **NEVER** run `gh pr update-branch` or merge the base into the branch
- **NEVER** `git push --force origin <BASE_BRANCH>` — only force-push feature branches
- **NEVER** create a local branch from `FETCH_HEAD` — use `origin/{branch}`
- **NEVER** skip the GraphQL PR validation check
- **NEVER** use `git branch -D` without first confirming `state=MERGED`
- **NEVER** fix issues inline — if validation fails, abort and suggest `/finalize-pr`
- **NEVER** push to a PR that is in the merge queue — a push removes it from the queue
- **NEVER** recreate a promotion PR into `main` on a git-flow repo — the
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

**PR already merged:**
Skip Steps 1–4. Go directly to Step 5 cleanup.

### Pre-Push Hook Auto-Fixes Files

**Detection**: `git push` fails, hook output shows "files were modified by this hook"

**Action**: Commit the auto-fixed files and retry the push:

```bash
git add -A
git commit -m "style: apply pre-push hook auto-fixes"
git push --force-with-lease origin {branch}-recreated
```

This commonly occurs with release-please CHANGELOG.md entries that don't conform to markdownlint rules.

## Related Skills

- **merge-pr** (github-workflows) — arms native auto-merge after rebase-pr recreates the branch
- **finalize-pr** (github-workflows) — full PR finalization pipeline that may invoke rebase-pr
- **pr-stacks** (github-workflows) — stack submission and merge tracking
- **pr-standards** (github-workflows) — PR creation and review standards
- **gh-cli-patterns** (github-workflows) — canonical gh CLI command shapes, placeholder convention, PR-readiness gate, default-branch detection
