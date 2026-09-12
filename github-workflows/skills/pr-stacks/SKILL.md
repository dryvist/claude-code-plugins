---
name: pr-stacks
description: >-
  Use when a change is too large for one PR, when the next unit of work depends
  on an unmerged PR, or when GitHub stacked pull requests / `gh stack` come up.
  The single source of truth for the PR-stack concept and the local pre-GitHub
  workflow: layering branches, keeping layers rebased, and landing a stack
  without fighting branch protection.
---

# PR Stacks

**Stacked pull requests** break one large change into an ordered chain of small,
dependent PRs that are reviewed and merged independently — so you can keep
building instead of waiting for each layer to merge.

```text
feat/frontend        → PR #3   (base: feat/api)
feat/api             → PR #2   (base: feat/auth)
feat/auth            → PR #1   (base: main)     ← bottom
main / develop                                  ← trunk
```

The bottom PR targets the **trunk**; each PR above targets the branch below it.
GitHub evaluates branch protection, required checks, and CI against the **trunk**
for *every* layer, not the PR's direct base — so a mid-stack PR is held to the
same standard as the bottom one.

Trunk is the repository's **default branch**: `main` on a trunk repo, `develop`
on a git-flow repo (detect it per `gh-cli-patterns` — never assume). Promotion of
`develop` → `main` is unchanged: `/promote-release`.

> [!IMPORTANT]
> All branches must live in the same repository — cross-fork stacks are not
> supported. The feature is in public preview, so a repository must opt in.

## Provisioning — Nix, never `gh extension install`

`gh` and the `gh stack` extension are provisioned by the Nix configuration
(`nix-home` provides the source-built extension via `programs.gh.extensions`;
`nix-ai` carries the upstream agent skill). **Never** run
`gh extension install github/gh-stack` — ad-hoc tool installs are banned (see
`nix-tool-policy`). If `gh stack` is missing, the fix is a change in the Nix
repository, not an install command here.

## Pre-GitHub workflow

Build **bottom-up**: foundational changes (types, schema, shared helpers) in the
lowest layer; consumers and UI above. One focused, reviewable change per layer.

```bash
gh stack init                 # start a stack; trunk defaults to the default branch
gh stack add <branch-name>    # add the next layer on top (or -Am "msg" to commit + add)
gh stack push                 # push the layers
gh stack submit               # create the PRs; --open marks them ready (default: draft)
gh stack view                 # inspect layers, PR links, and status
```

Full command/flag reference: `gh stack --help` and GitHub's *Stacked pull
requests CLI commands* docs; the upstream `gh-stack` skill covers it in depth.

## Rules that matter

- **Branch-from-feature is the sanctioned exception here.** `git-workflow-standards`
  says never branch from a feature branch; a stack layers each branch on the one
  below, and that is the one exception — through `gh stack` only. Never retarget a
  layer with `gh pr edit --base`; let `gh stack` own the bases.
- **Keep layers linear.** No merges between stack branches. When a lower layer
  changes, propagate with a **cascading rebase** (`gh stack` rebases the layers
  above, or trigger GitHub's server-side rebase) — never hand-rebase each layer.
  Layer updates are force-pushes.
- **Merging is stack-aware.** Landing any PR lands every unmerged layer below it
  atomically (merge commit, squash, and rebase all supported; merge-queue aware).
  A partial merge auto-retargets the layers above — those branches are **not**
  orphans, so leave them alone (`/prune-branches` already protects `--base` refs).
- **Stacks are not exempt from standards.** Apply `pr-standards` (issue linking,
  conventional titles, the `human:review` gate) to every layer; `gh stack submit`
  creates the PRs, so edit their bodies afterward as needed.
- **API merges** of a stacked PR must use GitHub's asynchronous merge endpoint —
  the legacy synchronous merge endpoints cannot merge a stack.

## Related Skills

- gh-cli-patterns (github-workflows) — default-branch (trunk vs git-flow) detection
- pr-standards (git-standards) — PR creation guards, issue linking, human-review gate
- git-workflow-standards (git-standards) — branch/worktree conventions this skill exceptions
- merge-pr (github-workflows) — merges the stack-aware way
- rebase-pr (github-workflows) — does not apply to stacked PRs; use cascading rebase
- prune-branches (github-workflows) — protects `--base` refs, so stack layers are safe
