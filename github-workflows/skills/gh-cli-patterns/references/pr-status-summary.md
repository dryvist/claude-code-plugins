# Canonical PR Status Summary

Reference detail for `gh-cli-patterns`, used by /ship and /finalize-pr for their status output. Loaded on demand.

Single authoritative format for all PR status output. Reference this section from any
skill that emits a summary — do NOT define local output formats in individual skills.

## Output format

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
  /merge-pr 42   (<OWNER>/<REPO>)

Blocked — needs human (2):
  https://github.com/<OWNER>/<REPO>/pull/43 — CI pending
  https://github.com/<OWNER>/<REPO>/pull/44 — Conflicts | 3 open comments
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Title** by invocation:

- `/ship` → `Ship Summary`
- `/finalize-pr` (single PR or current branch) → `PR Status`
- `/finalize-pr all` or `/finalize-pr org` → `Finalization Summary`

## Emoji mapping

| Emoji | Condition |
|-------|-----------|
| ✅ | `mergeable == MERGEABLE` AND `mergeStateStatus == CLEAN` or `HAS_HOOKS`, no unresolved threads |
| 🟡 | `mergeStateStatus == BEHIND`/`UNKNOWN`/`UNSTABLE`, `reviewDecision == REVIEW_REQUIRED`, or `mergeable == UNKNOWN` (GitHub computing) |
| 🔴 | `mergeable == CONFLICTING`, `mergeStateStatus == BLOCKED`/`DIRTY`/`DRAFT`, `reviewDecision == CHANGES_REQUESTED`, unresolved threads, `isDraft == true`, or CI failed |

## Status tags

Append after the URL, separated by ` | `. Omit when no issues exist ("Ready for review" suffices).

| Tag | Section 1 trigger | Section 2 trigger |
|-----|-------------------|-------------------|
| `Needs human review` | `labels` contains `human:review` | `labels` contains `human:review` |
| `Conflicts` | `mergeable == CONFLICTING` | `mergeable == CONFLICTING` |
| `Computing` | `mergeable == UNKNOWN` | `mergeable == UNKNOWN` |
| `N open comments` | Unresolved thread count from Phase 3 gate | _(not available — omit count)_ |
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
          commits(last:1){nodes{commit{statusCheckRollup{state}}}}
        }
      }
    }
  }' -f owner=<OWNER> -f repo=<REPO>
```

For org-wide mode, run once per repo from Phase 1 discovery, replacing `<OWNER>`/`<REPO>`.

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
