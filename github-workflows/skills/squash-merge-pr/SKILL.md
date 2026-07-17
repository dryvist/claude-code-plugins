---
name: squash-merge-pr
description: >-
  Squash-merge a PR into its base branch. Invoke only when the user explicitly
  requests a squash merge. Single PR by number or current branch. Refuses on
  git-flow repos when the base is main — use /promote-release there instead.
metadata:
  argument-hint: "[PR_NUMBER]"
---

# Squash Merge PR

Validates readiness, invokes `/finalize-pr` for soft blocks, then squash-merges.
Hard stops abort immediately. Some cases require human action: closed/merged PR,
draft, unresolvable conflicts, unrecoverable CI, or more than 100 review threads.

> **State warning**: Branch state, remote tracking, and PR status change between
> invocations. Re-run all git/gh commands from Step 1.

## Critical Rules

- Run the GraphQL readiness gate on every invocation before merging
- PR metadata updates are `/finalize-pr`'s responsibility
- Invoke `/finalize-pr` for soft blocks; abort on hard stops with reason
- Squash is never used to merge into `main` on a git-flow repo — Step 0 guards this

## Step 0: Refuse Squash Into Main On Git-Flow Repos

Resolve the PR's base branch and the repo's default branch:

```bash
BASE_BRANCH=$(gh pr view <PR_NUMBER> --json baseRefName --jq '.baseRefName')
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')
```

If `BASE_BRANCH == main` AND `DEFAULT_BRANCH == develop` (repo is on git-flow —
see /gh-cli-patterns Canonical Default-Branch Detection), **abort immediately,
no finalize**:

> "This is a `develop` → `main` promotion PR on a git-flow repo. `main` accepts
> merge commits only — squash and rebase are banned by ruleset, no exceptions.
> Run `/promote-release` instead, or merge manually with `gh pr merge --merge`."

Otherwise (trunk repo, or a git-flow repo's ordinary feature PR into `develop`),
continue to Step 1 — squash-merge remains the default there.

## Step 1: Validate PR Ready

Run the **canonical PR-readiness gate** and **canonical code-scanning alert count**
from /gh-cli-patterns. Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>` per the
placeholder convention. CodeQL is separate from CI — check both.

### 1.1 Hard stops (abort immediately, no finalize)

| Condition | Message |
|-----------|---------|
| `state != OPEN` | "PR is closed or merged — nothing to do" |
| `isDraft == true` | "PR is a draft — mark it ready for review first" |
| `human:review` label present | "PR is gated on human review before merge (see pr-standards Human-Review Gate). Merge only on an explicit same-session user instruction to merge THIS PR; when so instructed, `gh pr edit <PR_NUMBER> --remove-label human:review` first, then proceed. Otherwise abort." |
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
| All `reviewThreads.isResolved` | `true` | "Unresolved review threads remain" |
| CodeQL alert count | `0` | "Open CodeQL alerts remain — run /resolve-codeql manually" |

### 1.3 Auto-finalize

Invoke `/finalize-pr <PR_NUMBER>`. If it reports human intervention needed, abort with
its reason. Then re-run the full gate (Steps 1.1 + 1.2); if any soft block persists,
abort with the specific failing field.

## Step 2: Generate Squash Commit Message

Analyze the full changeset to generate a release-note-friendly commit message.
Replace `<PR_NUMBER>` and `<BASE_BRANCH>` (from Step 0) before running:

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

## Step 4: Sync Base Branch

```bash
git switch <BASE_BRANCH>
git pull origin <BASE_BRANCH>
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
- promote-release (github-workflows) — the develop → main merge-commit path this skill refuses to substitute for
- pr-standards (git-standards) — PR authoring and review standards
- gh-cli-patterns (github-workflows) — canonical gh CLI command shapes, placeholder convention, PR-readiness gate, default-branch detection
