# Canonical PR Status Summary

Reference detail for `gh-cli-patterns`, used by /ship and /finalize-pr for their status output. Loaded on demand.
Every `Ready to merge` entry must pass the [canonical PR-readiness gate](../SKILL.md#canonical-pr-readiness-gate), including the
[PR feedback ledger](pr-feedback-ledger.md) and required status-check reporting.

Single authoritative format for all PR status output. Reference this section from any
skill that emits a summary — do NOT define local output formats in individual skills.

## Output format

```text
{Title}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅  https://github.com/<OWNER>/<REPO>/pull/42   Ready to merge
  🟡  https://github.com/<OWNER>/<REPO>/pull/43   CI pending
  🔴  https://github.com/<OWNER>/<REPO>/pull/44   Conflicts | 3 unanswered feedback items
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All Open PRs — <OWNER>/<REPO>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅  https://github.com/<OWNER>/<REPO>/pull/42   Ready to merge
  🟡  https://github.com/<OWNER>/<REPO>/pull/43   CI pending
  🔴  https://github.com/<OWNER>/<REPO>/pull/44   Conflicts | 3 unanswered feedback items
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ready to merge (1):
  /merge-pr 42   (<OWNER>/<REPO>)

Blocked — needs human (2):
  https://github.com/<OWNER>/<REPO>/pull/43 — CI pending
  https://github.com/<OWNER>/<REPO>/pull/44 — Conflicts | 3 unanswered feedback items
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Title** by invocation:

- `/ship` → `Ship Summary`
- `/finalize-pr` (single PR or current branch) → `PR Status`
- `/finalize-pr all` or `/finalize-pr org` → `Finalization Summary`

## Emoji mapping

| Emoji | Condition |
|-------|-----------|
| ✅ | `mergeable == MERGEABLE` AND `mergeStateStatus == CLEAN` or `HAS_HOOKS`, no unresolved threads, zero unaddressed feedback, and every required check reported |
| 🟡 | `mergeStateStatus == BEHIND`/`UNKNOWN`/`UNSTABLE`, `reviewDecision == REVIEW_REQUIRED`, or `mergeable == UNKNOWN` (GitHub computing) |
| 🔴 | `mergeable == CONFLICTING`, `mergeStateStatus == BLOCKED`/`DIRTY`/`DRAFT`, `reviewDecision == CHANGES_REQUESTED`, unresolved threads, unaddressed feedback, a required check never reported, `isDraft == true`, or CI failed |

## Status tags

Append after the URL, separated by ` | `. Omit when no issues exist ("Ready for review" suffices).

| Tag | Section 1 trigger | Section 2 trigger |
|-----|-------------------|-------------------|
| `Needs human review` | `labels` contains `human:review` | `labels` contains `human:review` |
| `Conflicts` | `mergeable == CONFLICTING` | `mergeable == CONFLICTING` |
| `Computing` | `mergeable == UNKNOWN` | `mergeable == UNKNOWN` |
| `N unanswered feedback` | Unaddressed item count from the PR feedback ledger | Unaddressed items found when the gate is run |
| `required check never reported: <context>` | Required context absent from the status rollup | Required context absent from the status rollup |
| `CHANGES_REQUESTED` | `reviewDecision == CHANGES_REQUESTED` | `reviewDecision == CHANGES_REQUESTED` |
| `Review required` | `reviewDecision == REVIEW_REQUIRED` | `reviewDecision == REVIEW_REQUIRED` |
| `CI pending` | `statusCheckRollup.state != SUCCESS` | `mergeStateStatus == UNKNOWN`/`UNSTABLE` |
| `CI failed` | CI checks terminal failure | `mergeStateStatus == BLOCKED` (when other fields clean) |
| `Draft` | `isDraft == true` | `isDraft == true` |
| `Behind {default}` | `mergeStateStatus == BEHIND` | `mergeStateStatus == BEHIND` |

## Data queries

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
          labels(first:100){nodes{name} pageInfo{hasNextPage}}
          commits(last:1){nodes{commit{statusCheckRollup{
            state
            contexts(first:100){nodes{... on CheckRun{name} ... on StatusContext{context}} pageInfo{hasNextPage}}
          }}}}
        }
      }
    }
  }' -f owner=<OWNER> -f repo=<REPO>
```

For org-wide mode, run once per repo from Phase 1 discovery, replacing `<OWNER>`/`<REPO>`.

For each PR, compare the base branch's required contexts with the complete
rollup context names using the [canonical PR-readiness gate](../SKILL.md#canonical-pr-readiness-gate).
Report an absent required context by name as `required check never reported`;
see [github-actions-silent-failures](../../github-actions-silent-failures/SKILL.md).

## "Affected repos" definition

| Invocation | Affected repos for Section 2 |
|-----------|------------------------------|
| `/ship` | Current repo |
| `/finalize-pr` (single or `all`) | Current repo |
| `/finalize-pr org` | All repos with open PRs from Phase 1 discovery |

## Section 1 vs Section 2

- **Section 1**: Only the PRs targeted by this invocation (the ones being finalized/shipped)
- **Section 2**: ALL open PRs in every affected repo — including ones completely unrelated to
  this invocation. This gives a full picture of outstanding work.

## Merge commands

All modes: `/merge-pr <NUMBER>` — run from the worktree of the target repo.
The repo context is shown as a label, not a flag (the skill has no `--repo` argument):

```text
Ready to merge (1):
  /merge-pr 42   (JacobPEvans/claude-code-plugins)
```

For org-wide mode, note the target repo so the user knows which worktree to navigate to.
