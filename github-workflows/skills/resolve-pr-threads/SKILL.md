---
name: resolve-pr-threads
description: >-
  Orchestrates resolution of all GitHub PR feedback, including review threads,
  comments, review bodies, and review-bot findings, by grouping related feedback,
  processing each group sequentially inline with superpowers:receiving-code-review,
  and resolving threads via GraphQL. Use when you need to batch-process
  review feedback to unblock a PR merge.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash(gh *), Bash(git *), Skill
metadata:
  argument-hint: "[PR_NUMBER|all]"
---

<!-- markdownlint-disable MD013 -->

# Resolve PR Feedback (Orchestrator)

Processes all PR feedback by grouping related items, fixing each issue or
replying with command output as proof, tagging every reply with its ledger
marker, and finally resolving each finished thread with the canonical resolve
mutation.

> **State warning**: Thread IDs and resolution status change as reviews arrive.
> Re-fetch all open threads — cached thread lists from earlier are unreliable.

## Usage

```text
/resolve-pr-threads              # Current branch PR
/resolve-pr-threads 142          # Specific PR
/resolve-pr-threads all          # All open PRs with unaddressed feedback (sequential)
```

## Rules

- See /gh-cli-patterns for canonical query shapes, mutation names, and placeholder convention
- Follow [the PR feedback ledger](../gh-cli-patterns/references/pr-feedback-ledger.md) for item IDs, exclusions, bot parsing, coverage reviews, and marker verification
- **Run gh/git/jq commands directly** via Bash — no scripts, no temp files
- **Diagnose and fix errors** when a reply fails — the reply must land in the thread
- **When a reply fails**: re-fetch the source item and its IDs; for inline replies, also re-fetch the thread, verify `databaseId` is numeric, check `gh auth status`, then retry
- Do not reply to review threads by posting top-level PR comments as a fallback; top-level comments are fine for general PR feedback but cannot be used to resolve specific review threads

**Context inference**: Infer owner/repo/PR from current git context, then substitute
these values for `<OWNER>`, `<REPO>`, `<PR_NUMBER>` placeholders per `gh-cli-patterns`:

```bash
owner=$(gh repo view --json owner --jq '.owner.login')
repo=$(gh repo view --json name --jq '.name')
number=$(gh pr view --json number --jq '.number')
```

## Workflow

### Step 1: Fetch Unresolved Threads and All PR Feedback

**Run 1a–1d in parallel.**

#### Step 1a: Fetch Unresolved Threads

Run the **canonical fetch-threads query** from /gh-cli-patterns.
Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>` before running.

Filter to `isResolved == false`. Extract: `id` (PRRT_* node ID), `path`, `line`,
`comments.nodes[].databaseId` (numeric — for REST replies), `comments.nodes[].body`,
`comments.nodes[].author.login`.

#### Step 1b: Fetch Issue Comments

```bash
gh api repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments --paginate
```

#### Step 1c: Fetch Review Bodies

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews --paginate \
  --jq '[.[] | select(((.body // "") | length > 0) or .state == "CHANGES_REQUESTED")
         | {id, body, state, author: .user.login, submitted_at}]'
```

#### Step 1d: Fetch Inline Review Comments

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments --paginate
```

#### Step 1e: Build the Feedback Ledger

Identify the PR author, exclude ordinary feedback authored by that login and
reply comments that carry an addressed marker, ignore pure status pings, parse review-bot findings, and check for coverage gaps
as defined in [the PR feedback ledger](../gh-cli-patterns/references/pr-feedback-ledger.md).
Fetch every source without a date filter so a later commit cannot hide feedback.

### Step 2a: Group Related Threads

- **Same file + within 30 lines** → group together (max 5 threads per group)
- **Different file or >30 lines apart** → singleton groups
- Output numbered group list before dispatching

### Step 2b: Group Non-Thread Feedback

- Group related issue comments, review bodies, inline comments, and bot findings
  (max 5 items per group); keep each item's ledger ID attached.
- Process coverage-review gaps as required by the feedback ledger.
- Skip when the ledger has no unaddressed items.

### Step 3: Process Groups Sequentially (Inline)

**First**: Invoke `superpowers:receiving-code-review` via the Skill tool once.
Read and follow its full pattern. This applies to all thread and comment processing below.

#### 3a: Process Thread Groups

Process each thread group **sequentially** (one group at a time, no sub-agents).

For each thread group:

1. Read the code at the referenced location(s)
2. Apply the receiving-code-review pattern: fix the issue or answer with
   verifiable evidence. Acknowledgment alone does not address a finding.
3. If implementing a fix, make the change and commit (do NOT push yet)
4. Reply to each inline comment using the **REST reply pattern** from /gh-cli-patterns
   and include that item's exact `<!-- addressed: <id> -->` marker.
   Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>`, `<DATABASE_ID>` before running:

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments/<DATABASE_ID>/replies -f body="your reply <!-- addressed: inline-<DATABASE_ID> -->"
```

`<DATABASE_ID>` is the NUMERIC value from the fetch response, NOT the PRRT_ node ID.

Track results per thread:

- `PRRT_xxx: handled [commit:abc1234]`
- `PRRT_xxx: escalate [reason]`

#### 3b: Process Comment Groups

Process each comment group **sequentially** after all thread groups. Skip if no comments.

For each feedback group:

1. Apply the receiving-code-review pattern; fix the issue or answer the question.
2. For review bodies, post an issue comment quoting the first line. For issue
   comments and review bodies, post via `gh api repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments`;
   include that item's exact ledger marker in the reply. For inline comments, use
   the thread reply endpoint and include its marker.
3. For each `CHANGES_REQUESTED` review, answer the body, then request that
   reviewer again and notify the operator. Never dismiss a review:

   ```bash
   gh api -X POST repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/requested_reviewers \
     -f 'reviewers[]=<login>'
   ```

Do **not** use the Issues comments endpoint as a fallback for review-thread replies;
threaded review comments must be handled only via the dedicated thread-resolution flow.

Track results per feedback item:

- `FEEDBACK({id}): fixed [commit:abc1234]`
- `FEEDBACK({id}): answered [evidence/reply]`
- `FEEDBACK({id}): needs human [reason]`

### Step 4: Resolve Threads Sequentially

After all groups are processed, resolve each `handled` thread **one at a time** (not in parallel)
to avoid cascade failures. Use the **canonical resolve mutation** from /gh-cli-patterns.
Replace `<THREAD_ID>` (PRRT_* node ID) before running.

Skip `escalate` threads; flag for manual attention.

### Step 5: Verify, Push, and Report

Run the **canonical count-unresolved query** from /gh-cli-patterns and verify
every ledger item has a matching marker on the PR, including issue-comment edits
and all review-bot findings.
Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>` before running.

Must return `{"unresolved": 0, "overflow": false}`. Then push: `git push`.

## Batch Mode ("all")

1. `gh pr list --state open --json number,headRefName`
2. For each PR, fetch all feedback sources and build its ledger
3. Skip PRs with zero unaddressed feedback items
4. Run standard workflow for each PR with feedback
5. Verify each PR independently before moving to the next

This skill is a **single-pass resolver** — it processes all feedback found
at invocation time, then returns. If the caller needs to handle late-arriving feedback,
it is responsible for re-invoking this skill.

## Output Format

```text
PR #<PR_NUMBER> - Review Feedback Summary
Threads: {groupCount} groups ({threadCount} total) | Handled: {n} | Needs human: {n}
  Resolved via GraphQL: {n} | Verification: {0 unresolved}/{total}
Feedback: {n} items | Fixed: {n} | Answered: {n} | Unaddressed: {n}
Status: COMPLETE | PARTIAL ({n} need attention)
```

Omit "Threads:" when zero threads; omit "Feedback:" when no feedback items exist.

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Could not resolve to a node` | Invalid thread ID | Re-fetch threads, IDs may have changed |
| `Resource not accessible` | Permission issue | Check `gh auth status`, need repo write access |
| Verification shows >0 | Thread not resolved | Re-run mutation for remaining threads |
| Empty reviewThreads | No reviews yet | Exit cleanly |
| Exactly 100 threads returned | Pagination cap hit | Resolve visible threads first, then re-run |
| REST reply fails | Invalid `<DATABASE_ID>` or permissions | Verify numeric databaseId (not node ID) and ensure token has required repo permissions (403 = permission issue) |
| Feedback item has no marker | It was not answered or was edited after the reply | Re-fetch every source and answer the current item version |
| Reviews endpoint returns empty | No reviews submitted | Proceed with the other feedback sources |
| `\!` in jq expression | Claude Code Bash escapes `!` | Use `(.x == y &#124; not)` or `.x &#124; length > 0` instead of `!=` |

## Related Skills

- finalize-pr (github-workflows) — orchestrator that invokes resolve-pr-threads as part of PR finalization
- trigger-ai-reviews (github-workflows) — triggers AI reviewers whose feedback is resolved by this skill
- pr-standards (github-workflows) — PR authoring and review standards
- gh-cli-patterns (github-workflows) — canonical gh CLI command shapes, fetch/resolve/reply patterns, placeholder convention, and [PR feedback ledger](../gh-cli-patterns/references/pr-feedback-ledger.md)
