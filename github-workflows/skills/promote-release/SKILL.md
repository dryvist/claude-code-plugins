---
name: promote-release
description: >-
  Open and merge a develop-to-main promotion PR on a git-flow repo. Merge
  commit only, never squash or rebase — main accepts merge commits only.
  Every merge to main triggers release-please, which takes over tagging and
  release notes from there. Refuses on trunk repos (default branch main) —
  use /merge-pr instead.
---

# Promote Release

Promotes `develop` to `main` on a git-flow repo: opens (or reuses) a
`develop` → `main` PR, waits for it to go green, then merges it with a merge
commit. This is the **only** sanctioned way to move code into `main` on a
git-flow repo outside a `hotfix/*` PR.

> **State warning**: PR status, CI, and branch state change between
> invocations. Re-run every git/gh command from Step 0.

## Critical Rules

- **Merge commit only.** Never `--squash`, never `--rebase`. `main`'s ruleset
  bans both — see /gh-cli-patterns Canonical Default-Branch Detection.
- This skill does **not** run on trunk repos. Step 0 refuses immediately if
  the repo's default branch is `main`.
- Never invent a version number or write CHANGELOG entries yourself —
  release-please owns both once this PR lands on `main`.
- `release/*` stabilization branches are out of scope here — use this skill
  only for the ordinary `develop` → `main` promotion.

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

## Step 2: Find Or Create the Promotion PR

```bash
gh pr list --base main --head develop --state open --json number,url
```

**If one exists**: use it for the remaining steps.

**If none exists**, create it:

```bash
gh pr create --base main --head develop --title "chore: promote develop to main" --body "$(cat <<'EOF'
## Summary
Promotes the current state of `develop` to `main`.

## Notes
- Merge commit only — `main`'s ruleset bans squash and rebase.
- Merging this PR triggers release-please on `main`, which opens its own
  release PR (version bump + CHANGELOG) automatically. This PR does not
  touch versioning itself.
EOF
)"
```

## Step 3: Wait For CI

Run the **canonical PR-readiness gate** from /gh-cli-patterns against the
promotion PR's number. Replace `<OWNER>`, `<REPO>`, `<PR_NUMBER>` per the
placeholder convention in that skill.

If blocked (CI red, conflicts, unresolved threads), invoke `/finalize-pr
<PR_NUMBER>` — it works the same regardless of base branch — then re-run the
gate. Do not proceed until `mergeStateStatus` is `CLEAN` or `HAS_HOOKS`.

## Step 4: Merge Commit Into Main

> **Human-review gate.** A promotion into `main` is exactly the merge the
> `human:review` label protects (see pr-standards, git-standards → Human-Review
> Gate). If the promotion PR carries `human:review`, do NOT merge without an
> explicit same-session user instruction to promote; remove the label first when
> so instructed. If you want a human to sign off before the release, apply
> `human:review` and stop here instead of merging.

Invoke `/merge-pr <PR_NUMBER>` directly — its default is a merge commit, and
Step 0 there recognizes this exact base-branch shape as a legitimate
promotion and lets it through.

**Never** pass `--squash` or `-s` to `/merge-pr` here — both are banned by
`main`'s ruleset on a git-flow repo (its Step 0 aborts a `--squash` attempt
against `main` on a git-flow repo), and squashing would silently strip the
multi-commit history the promotion exists to preserve.

## Step 5: Report

```bash
gh pr view <PR_NUMBER> --json state,mergedAt --jq '{state, mergedAt}'   # expect: MERGED
```

Report the merge and note that release-please now owns the next step: it
watches `main` and opens its own release PR (version bump, CHANGELOG,
eventual tag) with no further action needed here. Do not create a release PR
or tag manually.

## Related Skills

- merge-pr (github-workflows) — invoked directly by Step 4 above to perform the
  merge commit; the feature-PR-into-develop path too, and refuses `--squash`
  into main on a git-flow repo
- finalize-pr (github-workflows) — drives the promotion PR to mergeable state, same as any other PR
- rebase-pr (github-workflows) — refuses and points here when its target is main on a git-flow repo
- gh-cli-patterns (github-workflows) — canonical gh CLI command shapes, placeholder convention, PR-readiness gate, default-branch detection
- pr-standards (git-standards) — the Human-Review Gate: a promotion into main is exactly the merge `human:review` protects
- git-flow-next (git-workflows) — Dedicated git-flow-next guide, worktree setup, and promotion steps
