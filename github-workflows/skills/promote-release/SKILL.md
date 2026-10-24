---
name: promote-release
description: >-
  Prepare a release on develop and promote it to main on a git-flow repo.
  Confirm the auto-merging release-please PR landed on develop, validate the
  promotion, and merge develop to main with a merge commit; release-please
  tags on promotion.
  Refuses on trunk repos (default branch main) — use /merge-pr instead.
---

# Promote Release

On pushes to `develop`, release-please keeps one `release-please--*` PR open
against `develop` for the version, CHANGELOG, and release notes; it does not
tag at that point. That PR is set to auto-merge and merges itself when its
checks pass. This skill confirms it merged, validates `develop`, then promotes
`develop` to `main` with a merge commit. Release-please tags and releases the
release commit after promotion to `main`.

> **State warning**: PR status, CI, and branch state change between
> invocations. Re-run every git/gh command from Step 0.

## Critical Rules

- **Merge commit only** for `develop` → `main`. Never squash or rebase the
  promotion PR — `main`'s ruleset bans both. See /gh-cli-patterns Canonical
  Default-Branch Detection.
- This skill does **not** run on trunk repos. Step 0 refuses immediately if
  the repo's default branch is `main`.
- Never invent a version, write CHANGELOG entries, create a release PR, or tag
  by hand. Release-please prepares the release on `develop` and tags the
  promoted commit on `main`.
- `release/*` stabilization branches are out of scope for this workflow.

## Step 0: Confirm Git-Flow Repo

```bash
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')
```

If `DEFAULT_BRANCH != develop`, **abort**:

> "This repo's default branch is `{DEFAULT_BRANCH}`, not `develop` — it is not
> on the git-flow model. There is no develop → main promotion step here; use
> `/merge-pr` for ordinary PRs into `{DEFAULT_BRANCH}`."

## Step 1: Sync Develop

```bash
git fetch origin --force develop main
git log --oneline origin/main..origin/develop   # commits this promotion will carry
```

If the list is empty, **stop** and report: "`develop` has no commits ahead of
`main` — nothing to promote."

## Step 2: Merge In-Flight Develop PRs

Drive in-flight PRs targeting `develop` to merged before starting the freeze.
Use `/finalize-pr <PR_NUMBER>` followed by `/merge-pr <PR_NUMBER>`; use
`/pr-sweep` when there are many. Do not start the freeze while PRs owned by
this session are mid-flight.

After those PRs merge, refresh `develop` and confirm it still has commits ahead
of `main` before creating or reusing the promotion PR. If it is empty, stop;
nothing remains to promote.

## Step 3: Find Or Create the Promotion PR and Freeze Develop

```bash
gh pr list --base main --head develop --state open --json number,url,isDraft
```

Use the open PR if one exists. The scheduled promotion-drift job opens it as a
draft; run `gh pr ready <PR_NUMBER>` when `isDraft` is true, and never run
`gh pr update-branch` on it. Otherwise, create it:

```bash
gh pr create --base main --head develop --title "chore: promote develop to main" --body "Promotes the release-prepared commits from develop to production main."
```

Add the `release:in-progress` label to the promotion PR
(`gh pr edit <PR_NUMBER> --add-label release:in-progress`). That label enables
the required `release-freeze` commit status, which fails every other open PR
targeting `develop` until the promotion PR closes. The `release-please--*`
release PR and `hotfix/*` heads are exempt.

## Step 4: Finish Release-Please on Develop

If the repository uses release-please, wait until the workflow run for
`develop`'s current HEAD has finished. The `release-please--*` PR is set to
auto-merge: wait for it to merge. If it is open, green and unmerged after the
checks finish, merge it with `/merge-pr <RELEASE_PR_NUMBER> --squash`. The
freeze from Step 3 keeps every other PR out, so this release commit is the last
commit on `develop` before the promotion. A release commit that merged before
the freeze may sit below later commits; those ship in the promotion and are
versioned by the next release. Repositories without release-please skip this
step.

## Step 5: Validate Develop

Check every check run and commit status on `develop`'s new HEAD. All must be
green. Use either:

```bash
gh api repos/<OWNER>/<REPO>/commits/<SHA>/check-runs
gh api repos/<OWNER>/<REPO>/commits/<SHA>/status
```

or `gh pr checks` for the develop PRs. If any check or status fails, remove
`release:in-progress`, fix the failure through a PR, and restart at Step 2.
The release-please and hotfix exemptions do not apply to fixes.

## Step 6: Check Promotion Readiness

Run the **canonical PR-readiness gate** from /gh-cli-patterns against the
promotion PR. Replace `<OWNER>`, `<REPO>`, and `<PR_NUMBER>` per that skill.
If a soft block remains, use `/finalize-pr <PR_NUMBER>` and rerun the gate;
stop on any hard block.

> **Human-review gate.** Read github-workflows pr-standards → Human-Review
> Gate. If the promotion PR carries `human:review`, stop unless the user
> explicitly instructs in their own words in this session to merge this exact
> PR. On that instruction, remove the label before proceeding.

## Step 7: Merge Commit Into Main

Invoke `/merge-pr <PR_NUMBER>` to merge the promotion PR. Use a merge commit;
never squash or rebase into `main`.

## Step 8: Report

Report the promotion and verify the tag or GitHub Release with
`git ls-remote --tags origin` or `gh release view`. The push to `main` makes
release-please create the tag and GitHub Release for the release-please PR's
commit, which is already an ancestor of `main`. Do not open a PR to merge
`main` into `develop`, manually create another release PR, or tag by hand.

## Related Skills

- merge-pr (github-workflows) — invoked to merge the release-please PR and the
  promotion PR with their required merge methods
- finalize-pr (github-workflows) — drives in-flight PRs and the promotion PR
  to merge-ready state
- pr-sweep (github-workflows) — handles many in-flight PRs
- rebase-pr (github-workflows) — refuses and points here when its target is
  `main` on a git-flow repo
- gh-cli-patterns (github-workflows) — canonical gh CLI command shapes,
  placeholder convention, PR-readiness gate, and default-branch detection
- pr-standards (github-workflows) — human-review label criteria and merge gate
- For branch creation and PR-branch sync, follow the [Git Town rule](https://github.com/dryvist/ai-llm-prompts/blob/main/auto-ai-agent/instructions/agentsmd/rules/on-demand/git-flow.md).
