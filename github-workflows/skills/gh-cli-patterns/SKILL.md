---
name: gh-cli-patterns
description: >-
  Canonical reference for all gh CLI command shapes used by skills in this
  plugin. Defines the placeholder convention, default-branch (trunk vs
  git-flow) detection, allowed --json fields, GraphQL fallback rules,
  -f/-F/--raw-field flag semantics, the PR-readiness gate, code-scanning
  alert query, review-thread fetch/count/resolve mutations, and heredoc
  bodies. Prevents Unknown JSON field errors and divergent query shapes.
---

# gh CLI Canonical Patterns — github-workflows

## Placeholder Convention

Two visually distinct notations — never mix them up:

| Notation | Meaning | Example |
|---|---|---|
| `$varName` | GraphQL variable name — **keep as literal text** in the query body | `$prNumber` |
| `<UPPER_NAME>` | Shell template — **replace before running** | `<PR_NUMBER>` |

Standard replacements:

```text
<OWNER>          → $(gh repo view --json owner --jq '.owner.login')
<REPO>           → $(gh repo view --json name  --jq '.name')
<PR_NUMBER>      → $(gh pr view  --json number --jq '.number')  (integer)
<THREAD_ID>      → PRRT_* node ID from the fetch-threads query (string)
<DATABASE_ID>    → numeric comment ID from the fetch-threads query
<DEFAULT_BRANCH> → see Canonical Default-Branch Detection below
```

## Canonical Default-Branch Detection

Repos in this org run one of two branch models. Detect which one before
using any literal `main` in a PR base, sync target, or merge command:

```bash
gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
# or, without gh: git remote show origin | grep 'HEAD branch'
```

| `<DEFAULT_BRANCH>` | Model | What it means for skills in this plugin |
|---|---|---|
| `main` | Trunk | `main` is both the default branch and production. Existing squash-to-main behavior applies unchanged. |
| `develop` | git-flow (see [git-flow rule](https://github.com/dryvist/ai-assistant-instructions/blob/main/agentsmd/rules/git-flow.md)) | `develop` is the default integration branch — feature PRs target it, squash-merge is the default. `main` is production only: **merge commits only**, no direct pushes, every merge triggers release-please. |

**Never infer the model from the current local branch name** — always read
`defaultBranchRef` (or `origin/HEAD`) fresh, since it can differ per repo and
per invocation.

A PR's own base branch (`gh pr view --json baseRefName --jq '.baseRefName'`)
can still be `main` on a git-flow repo — that is a promotion PR (`develop` →
`main`), not a feature PR, and it is merge-commit-only regardless of what
this section's detection returns. See `/promote-release`.

## `gh pr view --json` — REST-Only

`reviewThreads` is **not** a valid `--json` field — it is GraphQL-only. Any
`gh pr view --json reviewThreads` call fails with `Unknown JSON field: "reviewThreads"`.

Other GraphQL-only fields: inline thread structure, resolution status, full
`mergeStateStatus` enum.

**Rule**: if the field isn't returned by `gh pr view --json` (no value), use `gh api graphql`.

## REST vs GraphQL

| Operation | Use |
|---|---|
| Fetch unresolved threads | GraphQL — see Canonical Review-Thread Queries |
| Verify thread resolution count | GraphQL — see Canonical Review-Thread Queries |
| Resolve a thread | GraphQL — `resolveReviewThread` mutation |
| Reply to a thread | GraphQL (`addPullRequestReviewThreadReply`) or REST (simpler for markdown/special chars) |
| Reply to a PR-level comment | REST `repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments` |
| PR state fields (`state`, `mergeable`, `mergeStateStatus`, etc.) | `gh pr view --json` if listed; else GraphQL |

## Flag Semantics

| Flag | Use |
|---|---|
| `-f key=value` | String — for the `-f query='...'` GraphQL body and string variables |
| `-F key=value` | Auto-typed — for `Int!` and `Boolean!` GraphQL variables |
| `--raw-field 'key=value'` | Literal string, no `$var` expansion — for queries using inline `<PLACEHOLDER>` substitution |

**Never interpolate shell `$VARS` inside a GraphQL query string.** Declare typed variables
with `-f`/`-F` instead.

## Canonical PR-Readiness Gate

Use `first: 100` (never `first: 25` or `last: 100`). Always include `pageInfo`.

Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>` before running (see Placeholder Convention above).

```bash
gh api graphql -f query='
  query($owner:String!,$repo:String!,$prNumber:Int!){
    repository(owner:$owner,name:$repo){
      pullRequest(number:$prNumber){
        state mergeable mergeStateStatus isDraft reviewDecision
        commits(last:1){nodes{commit{statusCheckRollup{state}}}}
        reviewThreads(first:100){nodes{isResolved} pageInfo{hasNextPage}}
      }
    }
  }' -f owner=<OWNER> -f repo=<REPO> -F prNumber=<PR_NUMBER>
```

Inside the `-f query='...'` body, `$owner`/`$repo`/`$prNumber` are GraphQL variable names —
keep them literal. After the closing `'`, `-f owner=<OWNER>` etc. bind values — replace the
`<ANGLE_BRACKET>` placeholders with actual strings.

Required values — abort if any fail:

| Field | Required | Abort message |
|---|---|---|
| `state` | `OPEN` | "PR is not open" |
| `mergeable` | `MERGEABLE` | "PR has git conflicts" |
| `mergeStateStatus` | `CLEAN` or `HAS_HOOKS` | "PR blocked: {value}" |
| `isDraft` | `false` | "PR is a draft" |
| `reviewDecision` | `APPROVED` or `null` | "Review decision: {value}" |
| `statusCheckRollup.state` | `SUCCESS` | "CI: {state}" |
| All `reviewThreads.isResolved` | `true` | "Unresolved threads" |
| `reviewThreads.pageInfo.hasNextPage` | `false` | ">100 threads — paginate" |

> NOT-ready `mergeStateStatus` values: `BEHIND`, `BLOCKED`, `DIRTY`, `DRAFT`, `UNKNOWN`, `UNSTABLE`.

## Canonical Code-Scanning Alert Count

Replace `<OWNER>`, `<REPO>` before running.

```bash
gh api 'repos/<OWNER>/<REPO>/code-scanning/alerts?state=open&per_page=100' \
  --jq 'length' || echo "0"
```

`per_page=100` covers realistic alert counts. `|| echo "0"` handles disabled code-scanning (404).
Must return `0`; otherwise invoke `/resolve-codeql fix`.

## Canonical Review-Thread Queries

Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>` using inline literal substitution before running
(uses `--raw-field` — no `-f`/`-F` variable binding).

**Fetch unresolved threads** (`id` = `PRRT_*` node ID for mutations, `databaseId` = numeric ID for REST replies):

```bash
gh api graphql --raw-field 'query=query {
  repository(owner: "<OWNER>", name: "<REPO>") {
    pullRequest(number: <PR_NUMBER>) {
      reviewThreads(first: 100) {
        nodes {
          id isResolved path line startLine
          comments(first: 100) {
            nodes { id databaseId body author { login } createdAt }
          }
        }
      }
    }
  }
}'
```

**Count unresolved** (must equal `0` before merging; checks overflow):

```bash
gh api graphql --raw-field 'query=query {
  repository(owner: "<OWNER>", name: "<REPO>") {
    pullRequest(number: <PR_NUMBER>) {
      reviewThreads(first: 100) { nodes { isResolved } pageInfo { hasNextPage } }
    }
  }
}' --jq '{unresolved: ([.data.repository.pullRequest.reviewThreads.nodes[]
  | select(.isResolved == false)] | length),
  overflow: .data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage}'
```

Must return `{"unresolved": 0, "overflow": false}`. Non-zero `unresolved` or `overflow: true`
means threads remain.

## Review-Thread Mutations

| Operation | Correct | WRONG — do not use |
|---|---|---|
| Reply | `addPullRequestReviewThreadReply` | `addPullRequestReviewComment` (creates new comment, not a reply) |
| Resolve | `resolveReviewThread` | `resolvePullRequestReviewThread` (does not exist) |

Replace `<THREAD_ID>` and `<DATABASE_ID>` before running.

```bash
# Reply via GraphQL (use REST below for markdown/special characters)
gh api graphql --raw-field 'query=mutation {
  addPullRequestReviewThreadReply(
    input: {pullRequestReviewThreadId: "<THREAD_ID>", body: "reply text"}
  ) { comment { id body } }
}'

# Reply via REST (simpler for markdown and special characters)
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments/<DATABASE_ID>/replies -f body="reply text"

# Resolve
gh api graphql --raw-field 'query=mutation {
  resolveReviewThread(input: {threadId: "<THREAD_ID>"}) { thread { id isResolved } }
}'
```

Failure guide: stale `<THREAD_ID>` → re-fetch threads; permission error → `gh auth status`;
wrong mutation name → check table above.

## Canonical PR Status Summary

Single authoritative format for all PR status output. Reference this section from any
skill that emits a summary — do NOT define local output formats in individual skills.

### Output format

```text
{Title}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅  https://github.com/<OWNER>/<REPO>/pull/42   Ready for review
  🟡  https://github.com/<OWNER>/<REPO>/pull/43   CI pending
  🔴  https://github.com/<OWNER>/<REPO>/pull/44   Conflicts | 3 open comments
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All Open PRs — <OWNER>/<REPO>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅  https://github.com/<OWNER>/<REPO>/pull/42   Ready for review
  🟡  https://github.com/<OWNER>/<REPO>/pull/43   CI pending
  🔴  https://github.com/<OWNER>/<REPO>/pull/44   Conflicts | 3 open comments
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ready to merge (1):
  /squash-merge-pr 42   (<OWNER>/<REPO>)

Blocked — needs human (2):
  https://github.com/<OWNER>/<REPO>/pull/43 — CI pending
  https://github.com/<OWNER>/<REPO>/pull/44 — Conflicts | 3 open comments
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Title** by invocation:

- `/ship` → `Ship Summary`
- `/finalize-pr` (single PR or current branch) → `PR Status`
- `/finalize-pr all` or `/finalize-pr org` → `Finalization Summary`

### Emoji mapping

| Emoji | Condition |
|-------|-----------|
| ✅ | `mergeable == MERGEABLE` AND `mergeStateStatus == CLEAN` or `HAS_HOOKS`, no unresolved threads |
| 🟡 | `mergeStateStatus == BEHIND`/`UNKNOWN`/`UNSTABLE`, `reviewDecision == REVIEW_REQUIRED`, or `mergeable == UNKNOWN` (GitHub computing) |
| 🔴 | `mergeable == CONFLICTING`, `mergeStateStatus == BLOCKED`/`DIRTY`/`DRAFT`, `reviewDecision == CHANGES_REQUESTED`, unresolved threads, `isDraft == true`, or CI failed |

### Status tags

Append after the URL, separated by ` | `. Omit when no issues exist ("Ready for review" suffices).

| Tag | Section 1 trigger | Section 2 trigger |
|-----|-------------------|-------------------|
| `Conflicts` | `mergeable == CONFLICTING` | `mergeable == CONFLICTING` |
| `Computing` | `mergeable == UNKNOWN` | `mergeable == UNKNOWN` |
| `N open comments` | Unresolved thread count from Phase 3 gate | _(not available — omit count)_ |
| `CHANGES_REQUESTED` | `reviewDecision == CHANGES_REQUESTED` | `reviewDecision == CHANGES_REQUESTED` |
| `Review required` | `reviewDecision == REVIEW_REQUIRED` | `reviewDecision == REVIEW_REQUIRED` |
| `CI pending` | `statusCheckRollup.state != SUCCESS` | `mergeStateStatus == UNKNOWN`/`UNSTABLE` |
| `CI failed` | CI checks terminal failure | `mergeStateStatus == BLOCKED` (when other fields clean) |
| `Draft` | `isDraft == true` | `isDraft == true` |
| `Behind {default}` | `mergeStateStatus == BEHIND` | `mergeStateStatus == BEHIND` |

### Data queries

**Fetch PR URL** (for Section 1 — current PRs):

```bash
gh pr view <PR_NUMBER> --json url --jq '.url'
```

**Fetch all open PRs** (for Section 2 — one GraphQL call per affected repo):

`gh pr list --json` does NOT support `mergeStateStatus` — use GraphQL instead:

```bash
gh api graphql -f query='
  query($owner:String!,$repo:String!){
    repository(owner:$owner,name:$repo){
      pullRequests(states:OPEN,first:50){
        nodes{
          number url title mergeable reviewDecision mergeStateStatus isDraft
          commits(last:1){nodes{commit{statusCheckRollup{state}}}}
        }
      }
    }
  }' -f owner=<OWNER> -f repo=<REPO>
```

For org-wide mode, run once per repo from Phase 1 discovery, replacing `<OWNER>`/`<REPO>`.

### "Affected repos" definition

| Invocation | Affected repos for Section 2 |
|-----------|------------------------------|
| `/ship` | Current repo |
| `/finalize-pr` (single or `all`) | Current repo |
| `/finalize-pr org` | All repos with open PRs from Phase 1 discovery |

### Section 1 vs Section 2

- **Section 1**: Only the PRs targeted by this invocation (the ones being finalized/shipped)
- **Section 2**: ALL open PRs in every affected repo — including ones completely unrelated to
  this invocation. This gives a full picture of outstanding work.

### Merge commands

All modes: `/squash-merge-pr <NUMBER>` — run from the worktree of the target repo.
The repo context is shown as a label, not a flag (the skill has no `--repo` argument):

```text
Ready to merge (1):
  /squash-merge-pr 42   (JacobPEvans/claude-code-plugins)
```

For org-wide mode, note the target repo so the user knows which worktree to navigate to.

## Heredoc Body Pattern

```bash
gh pr edit <PR_NUMBER> --body "$(cat <<'EOF'
body content here
EOF
)"
```

Same pattern for `gh pr create`, `gh pr comment`, `gh issue comment`. Never use `--body-file`.

## Related Skills

- **pr-standards** (git-standards) — PR creation guards, issue linking
