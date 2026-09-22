---
name: trigger-ai-reviews
description: >-
  Use when asked to "trigger AI reviews", "request AI re-reviews", "get
  Claude/Gemini/Copilot to review my PR", "re-review this PR", or trigger
  review-request comments on a PR. Triggers all three AI reviewers by default,
  or specific ones when named.
metadata:
  argument-hint: "[PR_NUMBER] [claude|gemini|copilot|all]"
---

# Trigger AI Reviews

Trigger Claude, Gemini, and/or Copilot reviews on a PR with a single invocation.

## Usage

```text
/trigger-ai-reviews              # Trigger all 3 AIs on current branch's PR
/trigger-ai-reviews 42           # Trigger all 3 AIs on PR #42
/trigger-ai-reviews 42 claude    # Trigger only Claude
/trigger-ai-reviews 42 gemini    # Trigger only Gemini
/trigger-ai-reviews 42 copilot   # Trigger only Copilot
/trigger-ai-reviews 42 all       # Explicitly trigger all 3 AIs
```

## Step 1: Resolve PR Context

```bash
OWNER=$(gh repo view --json owner --jq '.owner.login')
REPO=$(gh repo view --json name --jq '.name')

# If PR_NUMBER not provided, get from current branch
PR_NUMBER=${PR_NUMBER:-$(gh pr view --json number --jq '.number' 2>/dev/null)}
```

Verify the PR exists and is open:

```bash
STATE=$(gh pr view "$PR_NUMBER" --json state --jq '.state')
[ "$STATE" = "OPEN" ] || { echo "PR #$PR_NUMBER is $STATE — only open PRs can be reviewed"; exit 1; }
```

## Step 2: Trigger Claude

Post a comment mentioning `@claude`:

```bash
gh pr comment "$PR_NUMBER" --body "@claude review this PR"
```

Expected: Claude Code bot picks up the mention and posts a review.

## Step 3: Trigger Gemini

Post the Gemini slash command:

```bash
gh pr comment "$PR_NUMBER" --body "/gemini review"
```

Expected: Gemini Code Assist bot responds with a review.

## Step 4: Trigger Copilot

Request Copilot as a reviewer via the GitHub API:

```bash
gh api \
  --method POST \
  "/repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/requested_reviewers" \
  -f "reviewers[]=copilot-pull-request-reviewer[bot]"
```

**Important limitation**: Copilot can only be requested once per PR. If Copilot has already submitted
a review, this API call will return an error — that is expected behavior.
See [references/ai-triggers.md](references/ai-triggers.md) for details.

## Step 5: Report Results

After all steps, report clearly:

```text
AI Review Triggers — PR #{NUMBER}

✅ Claude    — comment posted (@claude review this PR)
✅ Gemini    — comment posted (/gemini review)
✅ Copilot   — reviewer requested via API
  OR
⚠️  Copilot   — request failed (already reviewed or not installed)
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `gh: not found` | `gh` CLI missing | Install: `brew install gh` |
| `no PR found for current branch` | Branch has no open PR | Create PR first or provide PR number |
| PR is CLOSED/MERGED | Targeting wrong PR | Verify PR number |
| Copilot API 422 | Already reviewed or not installed | Expected — report as warning, not failure |
| Claude/Gemini comment fails | Auth or rate limit | Retry manually or check `gh auth status` |

## Selective Triggering

When a specific AI is named in the argument (e.g., `/trigger-ai-reviews 42 claude`), skip the other steps. Only run the steps for the requested AI(s).

## Related Skills

- finalize-pr (github-workflows) — full PR finalization pipeline; trigger AI reviews as part of the process
- resolve-pr-threads (github-workflows) — resolve review threads after AI reviewers post feedback
