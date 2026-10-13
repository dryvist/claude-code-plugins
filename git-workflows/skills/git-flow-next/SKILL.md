---
name: git-flow-next
description: >-
  Use git-flow-next with `develop` as the default and `main` as production.
  Branch feature work from `develop`, prepare releases there, promote them to
  `main` after session PRs merge, and merge hotfix branches into both branches.
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
| `main` | Production. Protected; no direct pushes. | **Merge commits only** — promotions from `develop` and hotfix PRs. |
| `develop` | Default integration branch. Protected; no direct pushes. | Squash-merged feature PRs, the squash-merged release-please PR, and merge-committed hotfix branches. Never merge `main` into `develop`. |
| `feature/<issue>-<sid8>-<slug>` | Topic work | Branched from fresh `develop`. |
| `release/<version>` | Release preparation | Not used in this release-please flow. On push to `develop`, release-please opens a `release-please--*` PR there for the version, CHANGELOG, and release notes; squash-merge it before promotion. |
| `hotfix/<slug>` | Production fix | Branch from `main`; PR to `main` with a merge commit; then merge-commit the hotfix branch into `develop`. |

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

The session that opened the work owns its production promotion. After that
session's PRs merge into `develop`, run `/promote-release` immediately. A
background PR-shepherd agent may run it. Before finishing a session, verify
`develop` has no unpromoted commits:

```bash
git fetch origin --force develop main && git log origin/main..origin/develop
```

**Planning Reminder**: Add "Merge develop into main" to the session checklist
at planning time.

`/promote-release` syncs `develop` and `main`, completes the release-please PR
on `develop`, validates the new `develop` head, and merges the promotion PR to
`main` with a merge commit. Never merge `main` into `develop`. Release-please
tags the release commit after it reaches `main`; do not create a release PR or
tag by hand.

## Related Skills

- **git-workflow-standards** (git-workflows) — Branch hygiene and worktree layout
- **pr-standards** (github-workflows) — PR templates and guards
- **promote-release** (github-workflows) — Promotion PR commands
- **wrap-up** (ai-cli-harness-better-practices) — End-of-session handler checking promotion state
