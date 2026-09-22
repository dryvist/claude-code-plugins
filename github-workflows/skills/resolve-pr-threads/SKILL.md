---
name: resolve-pr-threads
description: >-
  Orchestrates resolution of GitHub PR review threads AND reads recent non-thread
  PR comments (top-level + review bodies) by grouping related feedback,
  processing each group sequentially inline with superpowers:receiving-code-review,
  and resolving threads via GraphQL. Use when you need to batch-process
  review feedback to unblock a PR merge.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash(gh *), Bash(git *), Skill
metadata:
  argument-hint: "[PR_NUMBER|all]"
---

<!-- markdownlint-disable MD013 -->

# Resolve PR Review Threads (Orchestrator)

Orchestrates resolution of all unresolved PR review comments by grouping
related threads, processing each group sequentially inline to implement
fixes or provide explanations, then resolving threads via GitHub's GraphQL API.

> **State warning**: Thread IDs and resolution status change as reviews arrive.
> Re-fetch all open threads — cached thread lists from earlier are unreliable.

## Usage

```text
/resolve-pr-threads              # Current branch PR
/resolve-pr-threads 142          # Specific PR
/resolve-pr-threads all          # All open PRs with unresolved threads (sequential)
```

## Rules

- See /gh-cli-patterns for canonical query shapes, mutation names, and placeholder convention
- **Run gh/git/jq commands directly** via Bash — no scripts, no temp files
- **Diagnose and fix errors** when a reply fails — the reply must land in the thread
- **When a reply fails**: re-fetch thread IDs, verify the databaseId is numeric, check `gh auth status` — then retry
- Do not reply to review threads by posting top-level PR comments as a fallback; top-level comments are fine for general PR feedback but cannot be used to resolve specific review threads

**Context inference**: Infer owner/repo/PR from current git context, then substitute
these values for `<OWNER>`, `<REPO>`, `<PR_NUMBER>` placeholders per `gh-cli-patterns`:

```bash
owner=$(gh repo view --json owner --jq '.owner.login')
repo=$(gh repo view --json name --jq '.name')
number=$(gh pr view --json number --jq '.number')
```

## Workflow

### Step 1: Fetch Unresolved Threads and Recent Comments

**Run 1a and 1b in parallel.**

#### Step 1a: Fetch Unresolved Threads

Run the **canonical fetch-threads query** from /gh-cli-patterns.
Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>` before running.

Filter to `isResolved == false`. Extract: `id` (PRRT_* node ID), `path`, `line`,
`comments.nodes[].databaseId` (numeric — for REST replies), `comments.nodes[].body`,
`comments.nodes[].author.login`.

#### Step 1b: Get Last Commit Date

```bash
gh pr view <PR_NUMBER> --json commits --jq '.commits[-1].committedDate'
```

**Then run 1c and 1d in parallel.**

#### Step 1c: Fetch Top-Level PR Comments Since Last Commit

Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>`, `<LAST_COMMIT_DATE>` (ISO 8601) before running:

```bash
gh api "repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments?since=<LAST_COMMIT_DATE>"
```

#### Step 1d: Fetch Review Body Comments Since Last Commit

Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>`, `<LAST_COMMIT_DATE>` (ISO 8601) before running:

```bash
gh api "repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews" \
  --jq '[.[] | select(.submitted_at > "<LAST_COMMIT_DATE>" and (.body | length > 0))
         | {id, body, author: .user.login, submitted_at}]'
```

### Step 2a: Group Related Threads

- **Same file + within 30 lines** → group together (max 5 threads per group)
- **Different file or >30 lines apart** → singleton groups
- Output numbered group list before dispatching

### Step 2b: Group Recent Comments

- **Group by reviewer** — combine each reviewer's comments into one group (max 5 per group)
- Skip entirely when Steps 1c and 1d both returned zero comments

### Step 3: Process Groups Sequentially (Inline)

**First**: Invoke `superpowers:receiving-code-review` via the Skill tool once.
Read and follow its full pattern. This applies to all thread and comment processing below.

#### 3a: Process Thread Groups

Process each thread group **sequentially** (one group at a time, no sub-agents).

For each thread group:

1. Read the code at the referenced location(s)
2. Apply the receiving-code-review pattern: evaluate the feedback and decide —
   implement fix, push back with rationale, or flag as needs-human
3. If implementing a fix, make the change and commit (do NOT push yet)
4. Reply to each thread using the **REST reply pattern** from /gh-cli-patterns.
   Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>`, `<DATABASE_ID>` before running:

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments/<DATABASE_ID>/replies -f body="your reply"
```

`<DATABASE_ID>` is the NUMERIC value from the fetch response, NOT the PRRT_ node ID.

Track results per thread:

- `PRRT_xxx: handled [commit:abc1234]`
- `PRRT_xxx: needs-human [reason]`

#### 3b: Process Comment Groups

Process each comment group **sequentially** after all thread groups. Skip if no comments.

For each comment group:

1. Apply the receiving-code-review pattern: determine if each comment is
   actionable feedback, a question needing response, or general acknowledgment
2. For actionable comments: implement fixes and commit (do NOT push yet)
3. Reply via `gh api repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments -f body="..."`

Do **not** use the Issues comments endpoint as a fallback for review-thread replies;
threaded review comments must be handled only via the dedicated thread-resolution flow.

Track results per comment:

- `COMMENT({author}, {date}): actionable [commit:abc1234]`
- `COMMENT({author}, {date}): acknowledged [replied]`
- `COMMENT({author}, {date}): needs-human [reason]`

### Step 4: Resolve Threads Sequentially

After all groups are processed, resolve each `handled` thread **one at a time** (not in parallel)
to avoid cascade failures. Use the **canonical resolve mutation** from /gh-cli-patterns.
Replace `<THREAD_ID>` (PRRT_* node ID) before running.

Skip `needs-human` threads; flag for manual attention.

### Step 5: Verify, Push, and Report

Run the **canonical count-unresolved query** from /gh-cli-patterns.
Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>` before running.

Must return `{"unresolved": 0, "overflow": false}`. Then push: `git push`.

## Batch Mode ("all")

1. `gh pr list --state open --json number,headRefName`
2. For each PR, check for unresolved threads and recent comments
3. Skip PRs with zero threads AND zero comments
4. Run standard workflow for each PR with feedback
5. Verify each PR independently before moving to the next

This skill is a **single-pass resolver** — it processes all threads and comments found
at invocation time, then returns. If the caller needs to handle late-arriving reviews,
it is responsible for re-invoking this skill.

## Output Format

```text
PR #<PR_NUMBER> - Review Feedback Summary
Threads: {groupCount} groups ({threadCount} total) | Handled: {n} | Needs human: {n}
  Resolved via GraphQL: {n} | Verification: {0 unresolved}/{total}
Comments: {n} since last commit | Actionable: {n} | Acknowledged: {n} | Needs human: {n}
Status: COMPLETE | PARTIAL ({n} need attention)
```

Omit "Threads:" when zero threads; omit "Comments:" when zero comments.

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Could not resolve to a node` | Invalid thread ID | Re-fetch threads, IDs may have changed |
| `Resource not accessible` | Permission issue | Check `gh auth status`, need repo write access |
| Verification shows >0 | Thread not resolved | Re-run mutation for remaining threads |
| Empty reviewThreads | No reviews yet | Exit cleanly |
| Exactly 100 threads returned | Pagination cap hit | Resolve visible threads first, then re-run |
| REST reply fails | Invalid `<DATABASE_ID>` or permissions | Verify numeric databaseId (not node ID) and ensure token has required repo permissions (403 = permission issue) |
| `since` filter returns all comments | Invalid date format | Verify ISO 8601 format |
| Reviews endpoint returns empty | No reviews submitted | Proceed with threads only |
| `\!` in jq expression | Claude Code Bash escapes `!` | Use `(.x == y &#124; not)` or `.x &#124; length > 0` instead of `!=` |

## Related Skills

- finalize-pr (github-workflows) — orchestrator that invokes resolve-pr-threads as part of PR finalization
- trigger-ai-reviews (github-workflows) — triggers AI reviewers whose feedback is resolved by this skill
- pr-standards (github-workflows) — PR authoring and review standards
- gh-cli-patterns (github-workflows) — canonical gh CLI command shapes, fetch/resolve/reply patterns, placeholder convention
