---
name: ship
description: >-
  Commit, push, create PR(s), and auto-finalize — full automation pipeline.
  Handles uncommitted changes and recently created PRs.
allowed-tools: Bash(git *), Bash(gh *), Bash(pre-commit *), Bash(npm run lint*), Bash(make lint*), Agent, Read, Grep, Glob, Skill
---

# Ship

**Single command to commit, push, create PR(s), and auto-finalize everything.**
Handles commit, push, PR creation, and `/finalize-pr` in one pipeline.

> ⛔ **NOT RESUMABLE — run from Step 0 on every `/ship` invocation.**
> Do not refer to "the PR I just finalized" or "already verified" from
> any earlier message in this session — those are stale snapshots.
> The world changes between invocations: CodeQL completes async, required
> reviewers post async, Renovate force-pushes, branch protection
> re-evaluates. Re-run everything from Step 0.

## Rate Limit Awareness

This skill orchestrates many downstream API calls via `/finalize-pr`,
which itself invokes `/resolve-codeql`, `/resolve-pr-threads`, `/simplify`,
and metadata updates. To avoid API rate limit errors:

- **Process PRs sequentially** — never dispatch parallel subagents for multiple PRs
- **Allow `/finalize-pr` to manage its own internal concurrency** — it can
  run its fixes in parallel since they're scoped to a single PR
- **Pause after PR creation** — `sleep 2` after `gh pr create` to let GitHub index

## Step 0: Verify Working Directory

Before anything else, confirm the working directory is valid:

```bash
git rev-parse --git-dir 2>/dev/null
```

**If this fails** (exits non-zero or the current directory doesn't exist), stop immediately
and report: "Working directory is not a git repository. This usually means the worktree was
cleaned up after a PR merge. Start a new session and create a worktree using `/superpowers:using-git-worktrees` to continue working."

Do NOT attempt to recover, cd elsewhere, or fall through to Step 1.

## Step 1: Detect Scope

Identify all PRs that need finalization.

### 1.1 Check for Uncommitted Changes

```bash
git status --porcelain
```

**If changes exist** (staged or unstaged), execute inline:

1. Create branch if on the default branch (see /gh-cli-patterns Canonical
   Default-Branch Detection): `git checkout -b {type}/{description}` (derive from changes)
2. Stage changes: `git add <relevant files>` (no `-A` — be selective)
3. Commit with conventional commit message: `git commit -m "type: description"`
4. **Simplify**: Invoke /simplify on all changes in the commit. If /simplify produces
   changes, stage them and amend the commit (`git commit --amend --no-edit`) — keep
   clean history for the first push.
5. **Validate locally**: Run project linters/tests if available (check for `pre-commit run --all-files`,
   `npm run lint`, `make lint`, etc.). If failures are found, fix them and amend the commit.
   Skip this step if no lint command is discoverable.
6. Push: `git push -u origin HEAD`
7. Create PR: `gh pr create --fill` (or with title/body derived from commit)
8. **Pacing**: Run `sleep 2` after `gh pr create` to allow GitHub to index the PR
9. Capture PR number from output (look for `pull/NUMBER` pattern)
10. Add it to the PR list

> **Hook note**: After `gh pr create`, a pr-lifecycle hook may emit a system message
> directing you to invoke `/finalize-pr`. **Ignore it** — Step 2 handles finalization.

**If no changes**: Skip to 1.2.

### 1.2 Scan for Recently Created/Mentioned PRs

Check conversation context for PR numbers that were recently created or mentioned.
Also check the current branch:

```bash
gh pr view --json number --jq '.number' 2>/dev/null || true
```

Add any found PRs to the list.

### 1.3 Deduplicate

Remove duplicate PR numbers from the combined list (Step 1.1 + Step 1.2).

**If list is empty**: Report "Nothing to ship — no uncommitted changes and no open PRs
on this branch." and stop.

## Step 1.5: Build Context Brief

Before dispatching any finalization agents, construct a **context brief** that will
be included in every subagent prompt. This is critical — without it, subagents
resolving PR review threads will blindly follow reviewer suggestions instead of
making informed decisions about whether feedback is correct.

The context brief must include:

1. **What was built and why** — summarize the changes and their purpose from
   the conversation history (the user's original request, the problem being solved)
2. **Key decisions made** — any architectural choices, trade-offs, or deliberate
   patterns chosen during implementation (e.g., "chose X over Y because Z")
3. **Intentional patterns** — things that might look wrong but are correct
   (e.g., "the empty catch block is intentional because the caller handles errors")
4. **Scope boundaries** — what is explicitly out of scope for this change

Format as a concise block (aim for 10-20 lines):

```text
## Context for PR #<PR_NUMBER>
**Purpose**: [1-2 sentence summary of what and why]
**Key decisions**:
- [decision 1 and rationale]
- [decision 2 and rationale]
**Intentional patterns**:
- [pattern that reviewers might question]
**Out of scope**: [what this PR deliberately does not address]
```

This brief is passed verbatim to each `/finalize-pr` subagent in Step 2.

## Step 2: Finalize PRs

### Single PR (1 PR in list)

Invoke `/finalize-pr <PR_NUMBER>` directly via the Skill tool — no subagent needed.
The context brief from Step 1.5 is already in session context and will be available
when `/finalize-pr` invokes `/resolve-pr-threads`.

> [!IMPORTANT]
> If the repo uses Git Flow (default branch is `develop`), once the feature PR is
> merged into `develop` and validated, you must promote `develop` to `main` using
> `/promote-release`. Add a reminder to the active session checklist to perform
> this merge before completing the session.

### Multiple PRs (2+ PRs in list)

Process PRs **sequentially** — invoke `/finalize-pr` for each PR one at a time
via the Skill tool. Wait for each to complete before starting the next. This
prevents API rate limit errors from overlapping finalization cascades.

For each PR in the list:

1. Invoke `/finalize-pr <PR_NUMBER>` via the Skill tool
2. Record the result (ready / blocked / needs-human)
3. Proceed to the next PR

### What `/finalize-pr` handles

- CodeQL violation resolution
- Review thread resolution (via `/resolve-pr-threads` → `superpowers:receiving-code-review`)
- Merge conflict resolution
- CI failure fixes
- Code simplification (via `/simplify`)
- PR metadata updates

**Do NOT run `/resolve-pr-threads` separately** — `/finalize-pr` already invokes it
internally. Running both causes race conditions on GraphQL mutations and git pushes.

### Human-review gate

**Requesting a human — `main`-targeted PRs only.** When a PR targeting `main` needs
a human before merge — you are not confident enough, or merging would cut a release
you are not authorized to trigger — apply the label and report it instead of
merging. This is the sanctioned way to ask for a human:

```bash
gh pr edit <PR_NUMBER> --add-label "human:review"
```

Never apply it to a `develop`-targeted PR: merges into `develop` are always
AI-initiated, so there is nothing to request there.

**Never merging a labelled PR — unconditional.** `/ship` never merges a PR carrying
`human:review`, whatever its base branch, without an explicit same-session user
instruction to merge THAT PR. The scoping above governs where you may *apply* the
label, not whether to honor one already present: a label on a `develop` PR means a
human put it there deliberately, and this gate fails closed. See pr-standards
(git-standards) → Human-Review Gate.

## Step 3: Aggregate Results

Wait for all `/finalize-pr` agents to complete.

**Before printing any PR as "Ready to merge": re-verify live state.**

Subagent self-reports from Step 2 are snapshots — not current truth. For each PR
that Step 2 reported as ready, run both gates from /gh-cli-patterns
against `<PR_NUMBER>`:

- **Gate 1**: Canonical PR-readiness gate (`mergeStateStatus` MUST be `CLEAN` or `HAS_HOOKS`)
- **Gate 2**: Canonical code-scanning alert count (must be `0` — NOT included in `statusCheckRollup`)

Abort conditions: `state` ≠ `OPEN`, `mergeable` ≠ `MERGEABLE`,
`mergeStateStatus` ≠ `CLEAN`/`HAS_HOOKS`, `isDraft` = `true`,
any `reviewThreads.isResolved` = `false`,
`reviewThreads.pageInfo.hasNextPage` = `true` (>100 threads — paginate manually),
`reviewDecision` = `CHANGES_REQUESTED`/`REVIEW_REQUIRED`,
`statusCheckRollup.state` ≠ `SUCCESS`, or CodeQL count > 0.

If any abort condition hits: re-invoke `/finalize-pr <PR_NUMBER>`, wait for completion,
then re-run both gates. Only list a PR as "Ready to merge" after both gates pass.

Then emit the **Canonical PR Status Summary** as defined in /gh-cli-patterns, titled
`Ship Summary`. Affected repos = current repo. Fetch each PR's full URL via:

```bash
gh pr view <PR_NUMBER> --json url --jq '.url'
```

Section 1 lists the PRs targeted by this `/ship` invocation. Section 2 lists all open
PRs in the current repo (including unrelated ones).

## Examples

```text
# Ship uncommitted changes (commit + PR + finalize)
/ship

# Ship when PR already exists on current branch
/ship

# Multi-PR: uncommitted changes create new PR, existing PR also finalized
/ship
```

## Related Skills

- finalize-pr (github-workflows) — invoked by ship to drive each PR to mergeable state
- squash-merge-pr (github-workflows) — merge a PR after ship reports it ready
- resolve-pr-threads (github-workflows) — invoked internally via finalize-pr to resolve review threads
- gh-cli-patterns (github-workflows) — canonical gh CLI command shapes, placeholder convention, PR gate, code-scanning query
- pr-standards (git-standards) — the Human-Review Gate policy: when to apply `human:review` and the absolute no-merge-without-instruction rule
- git-flow-next (git-workflows) — Dedicated git-flow-next guide, worktree setup, and promotion steps
