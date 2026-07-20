---
name: git-flow-next
description: >-
  Work with repositories using the git-flow-next branching model (default branch is `develop`, production branch is `main`). Covers branch creation, worktree setup, atomic commits, PR targeting, validation on `develop`, and mandatory end-of-session promotion to `main`.
---

# git-flow-next Usage Guide

Use this skill when working on repositories configured for the Git Flow branching model.

## 1. Detect Adoption First

Before any branch, PR, or release work, check the repo's remote default branch:

```bash
gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
```

- If default branch is `develop` -> Follow this skill.
- If default branch is `main` -> Use trunk flow (squash-to-main directly). Do NOT follow this skill.
- Never infer adoption from the current local branch name.

## 2. The Branching Model

| Branch | Role | Gets changes by |
| --- | --- | --- |
| `main` | Production. Protected; no direct pushes. | **Merge commits only** — squash and rebase are banned. |
| `develop` | Default integration branch. Protected; no direct pushes. | Squash-merged feature PRs (default); merge commits for back-merges. |
| `feature/<issue>-<sid8>-<slug>` | Topic work | Branched from fresh `develop`. |
| `release/<version>` | Release stabilization | Branched from `develop`; merge-committed to `main`; back-merged to `develop`. |
| `hotfix/<slug>` | Production fix | Branched from `main`; PR to `main` (merge commit); back-merged to `develop`. |

## 3. Dedicated Worktree Setup

All feature development happens in dedicated worktrees. Branch names carry the
session id: `<issue>-<sid8>-<slug>`, where `<sid8>` is the first 8 hex chars of
the session/conversation id (generate `openssl rand -hex 4` if the runtime has
none). Issueless work drops the issue segment: `<sid8>-<slug>`. The worktree
directory matches the branch's name segment. Unique-per-session names make
worktree/branch collisions between concurrent sessions structurally
impossible; refs dryvist/ai-assistant-instructions#749.

To prevent wrong nesting:

1. Resolve the destination path using an absolute anchor and create the branch directly in the worktree:

   ```bash
   name="123-03a3a401-fix-inventory-loader"
   git worktree add -b "feature/$name" \
     "$(dirname "$(git rev-parse --git-common-dir)")/.worktrees/$name" origin/develop
   ```

2. The primary/root checkout remains on `develop`. Never check out feature branches at the root.
3. **One session, one branch**: never commit to or push another session's
   branch. A takeover continues on a NEW branch (fresh `<sid8>`), never by
   reusing the prior session's name.

## 4. Working a Change

1. Navigate to the newly created worktree directory:

   ```bash
   cd "$(dirname "$(git rev-parse --git-common-dir)")/.worktrees/123-03a3a401-fix-inventory-loader"
   ```

   *Note*: The branch `feature/123-03a3a401-fix-inventory-loader` is already created and checked out by the worktree setup step.
2. Commit atomically following Conventional Commits, referencing the issue (`#123`).
3. Open the PR targeting `develop` — every change to `develop` goes through a
   PR; the ruleset rejects direct pushes (`GH013`). Squash-merge feature PRs
   with `gh pr merge <PR_NUMBER> --squash --auto`: a bare `--squash` is rejected with
   "the base branch policy prohibits the merge" while checks settle, and
   `--auto` merges as soon as the policy is satisfied.
4. **Validation**: Thoroughly test and validate the merged code on `develop` before production promotion.

## 5. Mandatory Promotion to Production

"Promotion is a step you take, not an event that happens."

Feature PRs squash into `develop` and stop there. To release them:

1. Before finishing a session, fetch the latest remote state and verify if `develop` has unpromoted commits:

   ```bash
   git fetch origin --force develop main && git log origin/main..origin/develop
   ```

2. If commits exist, run `/promote-release` to open/reuse a `develop` -> `main` PR and merge it using a **merge commit** (`--merge` flag on `gh pr merge`).
   Never squash or rebase into `main`.
3. Merging triggers `release-please` on `main`, which automatically cuts the release, version bump, and tag.
4. **Planning Reminder**: You must add "Merge develop into main" to your session checklist/to-do list at planning time.

## Related Skills

- **git-workflow-standards** (git-standards) — Branch hygiene and worktree layout
- **pr-standards** (git-standards) — PR templates and guards
- **promote-release** (github-workflows) — Promotion PR commands
- **wrap-up** (ai-cli-harness-better-practices) — End-of-session handler checking promotion state
