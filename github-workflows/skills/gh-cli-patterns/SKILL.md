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
| `main` | Trunk | `main` is both the default branch and production. `/merge-pr` merges into it with its normal default (merge commit) or `--squash`/`-s`. |
| `develop` | git-flow (see [git-flow rule](https://github.com/dryvist/ai-assistant-instructions/blob/main/agentsmd/rules/git-flow.md)) | `develop` is the default integration branch — feature PRs target it, `/merge-pr`'s default (merge commit) or `--squash` both apply. `main` is production only: **merge commits only**, no direct pushes, every merge triggers release-please. |

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
        labels(first:100){nodes{name} pageInfo{hasNextPage}}
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
| `labels[].name` has `human:review` | absent, for an autonomous merge | "Human-review gate — merge only on explicit same-session user instruction for THIS PR, then remove the label; see pr-standards" |
| `labels.pageInfo.hasNextPage` | `false` | ">100 labels — paginate before trusting the gate. Never read a truncated label list as "`human:review` absent": this gate must fail closed" |
| `reviewDecision` | `APPROVED` or `null` | "Review decision: {value}" |
| `statusCheckRollup.state` | `SUCCESS` | "CI: {state}" |
| All `reviewThreads.isResolved` | `true` | "Unresolved threads" |
| `reviewThreads.pageInfo.hasNextPage` | `false` | ">100 threads — paginate" |

> NOT-ready `mergeStateStatus` values: `BEHIND`, `BLOCKED`, `DIRTY`, `DRAFT`, `UNKNOWN`, `UNSTABLE`.

## Canonical Code-Scanning Alert Count

Replace `<OWNER>`, `<REPO>` before running.

```bash
cscount() {  # $1 = <OWNER>/<REPO>
  local out
  if out=$(gh api "repos/$1/code-scanning/alerts?state=open&per_page=100" \
             --jq 'length' 2>&1); then
    printf '%s\n' "$out"; return 0
  fi
  case "$out" in
    *"must be enabled"*|*"no analysis found"*|*"HTTP 404"*) echo 0; return 0 ;;
    *) printf 'ALERT COUNT UNKNOWN: %s\n' "$out" >&2; return 1 ;;
  esac
}
```

`per_page=100` covers realistic alert counts. Must return `0`; otherwise invoke
`/resolve-codeql fix`.

**Never collapse every error to `0`.** Two very different conditions both return
**HTTP 403**, so branch on the message, not the status code:

| Message | Meaning | Correct result |
| --- | --- | --- |
| `Code Security must be enabled...` | Scanning is off — there are genuinely no alerts | `0` |
| `Resource not accessible by integration` | The token lacks the scope — the query answered nothing | **fail loudly** |

Treating the second as `0` turns a missing permission into a clean bill of
health, which is how an unreviewed PR passes an alert gate.

A 403 here is a credential problem, not a repository problem:

- GitHub App installation tokens need **`security_events: read`**. `checks` and
  `statuses` only expose an analysis's pass/fail rollup, never the alerts.
- Classic PATs need the `security_events` scope (`repo` alone is not enough on
  private repos).

If you cannot get that scope, read the check run instead of guessing — this
reports whether the analysis passed, though not the individual alerts:

```bash
gh pr view <PR_NUMBER> --repo <OWNER>/<REPO> --json statusCheckRollup \
  --jq '[.statusCheckRollup[]? | select(.name|test("CodeQL|Analyze"))
         | "\(.name)=\(.conclusion // .status)"] | join(" ")'
```

Absence of a CodeQL check does not prove code scanning is disabled: it is often
enabled through org-level **default setup**, which adds check runs to the PR
without any workflow file in the repo. Grepping `.github/workflows` for
`codeql.yml` will miss it.

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
Title by invocation: `/ship` -> `Ship Summary`; `/finalize-pr` (single/current) ->
`PR Status`; `/finalize-pr all`/`org` -> `Finalization Summary`. Full output
format, emoji mapping, status tags, data queries, "affected repos" definition,
and merge-command shape:
[references/pr-status-summary.md](references/pr-status-summary.md).

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
