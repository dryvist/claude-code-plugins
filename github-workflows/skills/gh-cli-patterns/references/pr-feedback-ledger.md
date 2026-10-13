# PR Feedback Ledger

Loaded by `/resolve-pr-threads` and every PR-readiness gate. The PR is not
ready while any feedback item lacks a matching addressed marker.

## Fetch and identify feedback

Fetch all pages from each source, with no commit-date filter, alongside the
unresolved GraphQL review-thread query in [gh-cli-patterns](../SKILL.md):

```bash
gh api repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments --paginate
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews --paginate \
  --jq '[.[] | select(((.body // "") | length > 0) or .state == "CHANGES_REQUESTED")
         | {id, body, state, author: .user.login, submitted_at}]'
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments --paginate
```

Get the PR author with `gh pr view <PR_NUMBER> --json author --jq '.author.login'`
(installation tokens cannot call `gh api user`). Ignore ordinary feedback
authored by that login, any comment that itself carries an `addressed` marker
(a reply, not feedback), and pure status pings (for example, “Persistent review
updated to latest commit”). Replies and status updates do not become feedback
merely because they are comments.

Assign each feedback item exactly one ID:

| Source | ID |
| --- | --- |
| Issue comment | `issuecomment-<databaseId>@<updated_at>` |
| Review body | `review-<id>` |
| Inline review comment | `inline-<databaseId>` |
| Review-agent finding | `agent-finding-<first 12 lowercase hex of SHA-1 of title and file path>` |

For issue comments, use the exact current `updated_at`; editing the source after a
reply changes its ID and reopens it. For agent findings, use the finding title
as shown or supplied; remove rendered bold delimiters. When absent, use the
first non-empty line of its body with surrounding Markdown emphasis removed.
Use the reported file path when present, otherwise an empty string. Compute
the hash from the exact UTF-8 string `<title>|<path-or-empty>`; do not include
a local filesystem path.

An item is addressed only when a comment on the PR contains its exact marker:

```html
<!-- addressed: <id> -->
```

One reply may carry multiple markers only when it explicitly answers each item;
otherwise post a separate reply per item. Re-fetch the source and marker-bearing
comments before the gate. An edited issue comment has a new ID and needs a new
answer. Never treat a commit, thread resolution, approval state, or plain
acknowledgment as a substitute for a marker.

## Review-agent findings

The `PR Reviewer Guide` comment (`github-actions[bot]`) can contain findings in
either layout below. Parse the current comment body each time; the bot edits one
issue comment in place. Keep the containing issue comment as an
`issuecomment-...` item as well as extracting each finding. Reply to the comment
with a summary of finding dispositions and its issue-comment marker; answer each
finding with its own `agent-finding-...` marker. An edit changes `updated_at` and
reopens the comment item.

1. **Machine block:** parse the JSON in this block:

   ```html
   <!-- pr-agent-review-state:v1
   {json}
   -->
   ```

   Each entry in `findings` is one
   finding and has a `body`; use its title and file/path when supplied, and
   otherwise derive the title from the first non-empty body line. Findings
   listed under the `✅ Resolved findings` details block are resolved; skip
   them. Process every other finding.
2. **Rendered block:** find the section headed
   `⚡ Recommended focus areas for review`. Each bold title starts one finding;
   its following text is that finding's body. Read through the next bold title
   or section boundary. Use a file path when present.

Fix each open finding in a commit or answer it with verifiable command output.
An acknowledgment alone is not an answer. Put the finding's marker in the reply.

## Review coverage gaps

If the review comment includes
`⚠️ Review coverage: The following files were not included in this review because of the token budget:`,
use exactly the following file list as the required second-review scope.

- If the repository is public and `zcode-job repos` lists it, follow the
  [delegate-to-ai skill](../../../../ai-delegation/skills/delegate-to-ai/SKILL.md)
  to submit a bounded ZCode review of those files. The operator has opted in
  for this route. ZCode must return review findings only; it does not edit files
  or post to GitHub.
- If the repository is private, is not listed, or ZCode is unavailable, use the
  router `review-private` role through the
  [fast-subagent skill](../../../../ai-delegation/skills/fast-subagent/SKILL.md).
  Never send private-repository content to ZCode.

Post the second-review result as one PR comment. Treat that designated report
as feedback even though the current session authored it: the independent
findings become `agent-finding-...` ledger items, and the report itself gets an
`issuecomment-<databaseId>@<updated_at>` marker. Reply to the report with that
marker and the disposition of every finding. If there are no findings, say so
in the reply. The PR is not ready until the report exists and is answered. Do
not treat other comments by the session identity as feedback.

## Replies and review decisions

Use a thread reply for inline comments, with that comment's `inline-...`
marker. Resolve its thread only after all feedback in that thread is answered.
For issue comments and review bodies, post an issue comment; a review body
cannot be replied to directly. Quote the first line of a review body in the
answer. Use the item's full marker in every reply:

```bash
gh api repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments -f body="$(cat <<'EOF'
> <first line of review body>

<fix or evidence-backed answer>

<!-- addressed: review-<id> -->
EOF
)"
```

For every `CHANGES_REQUESTED` review, answer its body, then request that
reviewer again and notify the operator. Use the harness `PushNotification`
tool where available (the [attention-notify plugin](../../../../attention-notify/README.md)
raises the local banner); otherwise include the notification in the final report.
Never dismiss a review.

If a `CHANGES_REQUESTED` review has an empty body, answer the submitted review
state with a concise disposition and the review's `review-<id>` marker.

```bash
gh api -X POST repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/requested_reviewers \
  -f 'reviewers[]=<login>'
```

## Readiness

The canonical PR-readiness gate in [gh-cli-patterns](../SKILL.md#canonical-pr-readiness-gate)
requires zero unaddressed ledger items and every required status-check context
reported. When a required context is absent from the status rollup, report
`required check never reported: <context>` and follow
[GitHub Actions silent-failure diagnostics](../../github-actions-silent-failures/SKILL.md).
