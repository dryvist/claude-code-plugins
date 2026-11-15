---
name: merge-pr
description: >-
  Arm native auto-merge on a PR with gh pr merge --auto. Defaults to a merge
  commit; pass --squash or -s to squash instead. Falls back to squash when the
  repo disallows merge commits. Single PR by number or current branch. Refuses
  to squash/rebase into main on a git-flow repo; promotion is daily and automatic.
metadata:
  argument-hint: "[PR_NUMBER] [--squash|-s]"
---

# Merge PR

Validates readiness, invokes `/finalize-pr` for soft blocks, then arms native
auto-merge. Hard stops abort immediately. Some cases require human action:
closed/merged PR, unresolvable conflicts, unrecoverable CI, or more than 100
review threads.

> **State warning**: Branch state, remote tracking, and PR status change between
> invocations. Re-run all git/gh commands from Step 1.

## Critical Rules

- Run the [canonical PR-readiness gate](../gh-cli-patterns/SKILL.md#canonical-pr-readiness-gate) on every invocation before arming auto-merge
- PR metadata updates are `/finalize-pr`'s responsibility
- Invoke `/finalize-pr` for soft blocks; abort on hard stops with reason
- Land only with `gh pr merge <PR_NUMBER> --auto` plus the resolved method flag.
  On a merge-queue branch this adds the PR to the queue; elsewhere it arms
  auto-merge. Never merge by hand in any other way.
- Merge commit is the default; `--squash`/`-s` opts into a squash merge
- Squash and rebase are never used to merge into `main` on a git-flow repo —
  Step 0 guards this. Promotion from the default branch to `main` is daily and
  automatic; agents do not promote by hand.
- If the PR belongs to a stack, merging it lands every unmerged layer below it
  atomically, and a partial merge auto-retargets the layers above. Do not treat
  those as orphans; see `/pr-stacks`.

## Step 0: Refuse Squash/Rebase Into Main On Git-Flow Repos

Resolve the PR's base branch and the repo's default branch:

```bash
BASE_BRANCH=$(gh pr view <PR_NUMBER> --json baseRefName --jq '.baseRefName')
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')
```

If `BASE_BRANCH == main` AND `DEFAULT_BRANCH == develop` (repo is on git-flow —
see /gh-cli-patterns Canonical Default-Branch Detection), **abort immediately,
no finalize**:

> "This is a `develop` → `main` promotion PR on a git-flow repo. Promotion is
> daily and automatic; agents do not promote by hand. `main` accepts merge
> commits only — squash and rebase are banned by ruleset, no exceptions."

Otherwise (trunk repo, or a git-flow repo's ordinary feature PR into `develop`),
continue to Step 1 with the requested (or default) merge method.

## Step 0.5: Resolve The Merge Method

```bash
gh repo view --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed
```

Decide before attempting any merge — never retry after a failed `gh pr merge`:

1. `--squash`/`-s` was passed → use squash. If `squashMergeAllowed == false`,
   abort: "Repo does not allow squash merges."
2. Otherwise → use a merge commit. If `mergeCommitAllowed == false` and
   `squashMergeAllowed == true`, fall back to squash and say so in the final
   report ("repo disallows merge commits — squashed instead").
3. Neither `mergeCommitAllowed` nor `squashMergeAllowed` (and no explicit
   `--squash`) → abort, reporting what the repo does allow.

Carry the resolved method (`merge` or `squash`) into Step 2 and Step 3.

## Step 1: Validate PR Ready

Run the [canonical PR-readiness gate](../gh-cli-patterns/SKILL.md#canonical-pr-readiness-gate)
and **canonical code-scanning alert count** from /gh-cli-patterns. The readiness
gate includes all items in the [PR feedback ledger](../gh-cli-patterns/references/pr-feedback-ledger.md).
Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>` per the
placeholder convention. CodeQL is separate from CI — check both.

### 1.1 Hard stops (abort immediately, no finalize)

| Condition | Message |
|-----------|---------|
| `state != OPEN` | "PR is closed or merged — nothing to do" |
| `isDraft == true` | "PR is a draft — mark it ready for review first" |
| `reviewThreads.pageInfo.hasNextPage == true` | ">100 review threads — paginate manually and re-verify before merging" |

### 1.2 Soft blocks (invoke /finalize-pr, then re-verify)

If any of the following fail, proceed to Step 1.3 (auto-finalize), then re-run the
full gate. If the gate still fails after finalization, abort with the specific reason.

| Check | Must be | Abort message (if still failing after finalize) |
|-------|---------|------------------------------------------------|
| `mergeable` | `MERGEABLE` | "PR has git conflicts — unresolvable" |
| `mergeStateStatus` | `CLEAN` or `HAS_HOOKS` | "PR merge state is {value} — still blocked after finalize" |
| `reviewDecision` | `APPROVED` or `null` | "Review decision is {value}" |
| `statusCheckRollup.state` | `SUCCESS` | "CI is {state} — unrecoverable" |
| PR feedback ledger | Zero unaddressed feedback items | "Unaddressed PR feedback remains" |
| Required status-check contexts | Every required context was reported in `statusCheckRollup.contexts` | "required check never reported: `<context>` — see [github-actions-silent-failures](../github-actions-silent-failures/SKILL.md)" |
| All `reviewThreads.isResolved` | `true` | "Unresolved review threads remain" |
| CodeQL alert count | `0` | "Open CodeQL alerts remain — run /resolve-codeql manually" |

### 1.3 Auto-finalize

Invoke `/finalize-pr <PR_NUMBER>`. If it reports human intervention needed, abort with
its reason. Then re-run the full gate (Steps 1.1 + 1.2); if any soft block persists,
abort with the specific failing field.

## Step 2: Generate Commit Message (squash only)

Merge commits use GitHub's default subject — skip this step entirely when
Step 0.5 resolved to `merge`.

For a squash, analyze the full changeset to generate a release-note-friendly
commit message. Replace `<PR_NUMBER>` and `<BASE_BRANCH>` (from Step 0) before
running:

```bash
git fetch origin <BASE_BRANCH>
git diff origin/<BASE_BRANCH>...HEAD
git log --oneline origin/<BASE_BRANCH>..HEAD
```

Generate:

- **Title**: Conventional commit format (`<type>: <description>`, under 70 chars)
- **Body**: 2-3 line explanation of what changed and why

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

Store the title in a shell variable:

```bash
SQUASH_TITLE="<generated title>"
```

## Step 3: Arm Native Auto-Merge

Capture the branch name (needed for cleanup and the report). Replace `<PR_NUMBER>` before running:

```bash
BRANCH=$(gh pr view <PR_NUMBER> --json headRefName --jq '.headRefName')
```

Merge without `--delete-branch` (avoids `git switch` failure in bare+worktree repos).
Use the heredoc body pattern from /gh-cli-patterns. Always pass `--auto`.

**Squash** (Step 0.5 resolved to squash, whether by `--squash`/`-s` or fallback):

```bash
gh pr merge <PR_NUMBER> --auto --squash --subject "$SQUASH_TITLE" --body "$(cat <<'EOF'
... generated body ...
EOF
)"
```

**Merge commit** (default):

```bash
gh pr merge <PR_NUMBER> --auto --merge
```

Single-quoted `'EOF'` prevents shell expansion. Closing `EOF` must be alone on its own line with no leading whitespace.

On a merge-queue branch (`merge_tier: hot`, base is the default branch) this adds
the PR to the merge queue; elsewhere it arms auto-merge. The platform merges when
the required checks pass. No person approves or clicks merge. The only hold is
the label `human:review`; agents never add it.

Verify the merge state. Replace `<PR_NUMBER>` before running:

```bash
gh pr view <PR_NUMBER> --json mergeStateStatus,autoMergeRequest
```

Never merge by hand in any other way, and never wait-then-merge. A push to a
queued PR removes it from the queue — do not push to a queued PR.

Clean up only after the PR is actually merged. Check the state:

```bash
gh pr view <PR_NUMBER> --json state --jq '.state'
```

If the state is not `MERGED`, stop here and report that auto-merge is armed.
Leave the branch and worktree in place; the platform merges when checks pass.

If the state is `MERGED`, delete the remote branch (GitHub may have auto-deleted it on merge — `|| true` handles that):

```bash
git push origin --delete "$BRANCH" || true
```

Find and remove the local worktree by branch name (works in any repo layout):

```bash
WORKTREE_PATH=$(git worktree list --porcelain | awk -v b="refs/heads/$BRANCH" '/^worktree/{p=$2} $0=="branch "b{print p}')
[ -n "$WORKTREE_PATH" ] && git worktree remove "$WORKTREE_PATH" || true
```

Delete the local branch ref (safe no-op if absent):

```bash
git branch -d "$BRANCH" || true
```

## Step 4: Sync Base Branch

Run only after the PR is merged:

```bash
git switch <BASE_BRANCH>
git pull origin <BASE_BRANCH>
git worktree prune
```

## Integration

Invoke at any time — auto-finalizes if needed:

```text
/merge-pr             # Current branch PR, arms auto-merge (merge commit)
/merge-pr 42          # Specific PR number, arms auto-merge (merge commit)
/merge-pr 42 --squash # Specific PR number, arms auto-merge (squash)
/merge-pr -s          # Current branch PR, arms auto-merge (squash)
```

## Related Skills

- finalize-pr (github-workflows) — invoked automatically by merge-pr when blockers are found
- rebase-pr (github-workflows) — recreates a conflicted PR branch on a fresh branch, then arms auto-merge
- pr-stacks (github-workflows) — stack-aware merge: landing a layer takes every unmerged layer below it
- pr-standards (github-workflows) — PR authoring and review standards
- gh-cli-patterns (github-workflows) — canonical gh CLI command shapes, placeholder convention, PR-readiness gate, default-branch detection
