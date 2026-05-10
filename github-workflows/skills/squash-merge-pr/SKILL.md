---
name: squash-merge-pr
description: >-
  Autonomously drive a PR to squash-merge: validates readiness, auto-invokes
  /finalize-pr to resolve any blockers, then executes the squash merge. Handles
  single PR from argument or current branch.
metadata:
  argument-hint: "[PR_NUMBER]"
---

# Squash Merge PR

Fully autonomous merge pipeline. Validates readiness, invokes `/finalize-pr`
automatically when blockers are found, then executes squash merge. The only
conditions that require human action are: PR is closed/merged, or PR is in draft.

> **State warning**: Branch state, remote tracking, and PR status change between
> invocations. Re-run all git/gh commands from Step 1.

## Critical Rules

- **Never skip validation** — always run the GraphQL check before merging
- **Never update PR metadata** — that's `/finalize-pr`'s job
- **Auto-finalize when blocked** — invoke `/finalize-pr` rather than stopping
- **Two hard stops only** — `state != OPEN` and `isDraft == true` abort without finalize

## Step 1: Validate PR Ready

Run the **canonical PR-readiness gate** from /gh-cli-patterns against
`<PR_NUMBER>`. Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>` per the placeholder convention.

### 1.1 Hard stops (abort immediately, no finalize)

| Field | Abort condition | Message |
|-------|-----------------|---------|
| `state` | `!= OPEN` | "PR is closed or merged — nothing to do" |
| `isDraft` | `true` | "PR is a draft — mark it ready for review first" |

### 1.2 Soft blocks (invoke /finalize-pr, then re-verify)

If any of the following fail, proceed to Step 1.3 (auto-finalize), then re-run the
full gate. If the gate still fails after finalization, abort with the specific reason.

| Field | Must be |
|-------|---------|
| `mergeable` | `MERGEABLE` |
| `mergeStateStatus` | `CLEAN` or `HAS_HOOKS` |
| `reviewDecision` | `APPROVED` or `null` |
| `statusCheckRollup.state` | `SUCCESS` |
| All `reviewThreads.isResolved` | `true` |
| `reviewThreads.pageInfo.hasNextPage` | `false` |

### 1.3 Auto-finalize

Invoke `/finalize-pr <PR_NUMBER>` via the Skill tool and wait for it to complete.
`/finalize-pr` handles CodeQL, review threads, merge conflicts, CI failures, and
metadata — everything needed to reach a mergeable state.

After `/finalize-pr` completes, re-run the full readiness gate (Steps 1.1 + 1.2). If
any soft block persists, abort with the specific failing field and reason.

## Step 2: Generate Squash Commit Message

Analyze the full changeset to generate a release-note-friendly commit message.
Replace `<PR_NUMBER>` before running:

```bash
git fetch origin main
git diff origin/main...HEAD
git log --oneline origin/main..HEAD
```

Generate:

- **Title**: Conventional commit format (`<type>: <description>`, under 70 chars)
- **Body**: 2-3 line explanation of what changed and why

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

Store the title in a shell variable:

```bash
SQUASH_TITLE="<generated title>"
```

## Step 3: Execute Squash Merge

Capture the branch name before merging (needed for cleanup). Replace `<PR_NUMBER>` before running:

```bash
BRANCH=$(gh pr view <PR_NUMBER> --json headRefName --jq '.headRefName')
```

Merge without `--delete-branch` (avoids `git switch` failure in bare+worktree repos).
Use the heredoc body pattern from /gh-cli-patterns:

```bash
gh pr merge <PR_NUMBER> --squash --subject "$SQUASH_TITLE" --body "$(cat <<'EOF'
... generated body ...
EOF
)"
```

Single-quoted `'EOF'` prevents shell expansion. Closing `EOF` must be alone on its own line with no leading whitespace.

Delete the remote branch (GitHub may have auto-deleted it on merge — `|| true` handles that):

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

## Step 4: Sync Main

```bash
git switch main
git pull origin main
git worktree prune
```

## Integration

Invoke at any time — auto-finalizes if needed:

```text
/squash-merge-pr          # Current branch PR
/squash-merge-pr 42       # Specific PR number
```

## Related Skills

- finalize-pr (github-workflows) — invoked automatically by squash-merge-pr when blockers are found
- rebase-pr (github-workflows) — alternative merge strategy that preserves commit history
- pr-standards (git-standards) — PR authoring and review standards
- gh-cli-patterns (github-workflows) — canonical gh CLI command shapes, placeholder convention, PR-readiness gate
