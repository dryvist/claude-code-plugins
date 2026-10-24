---
name: pr-stacks
description: Use to submit and track dependent stacked pull requests.
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

For branch creation, PR targets, and PR-branch sync, follow the
[Git Town rule](https://github.com/dryvist/ai-llm-prompts/blob/main/auto-ai-agent/instructions/agentsmd/rules/on-demand/git-flow.md).
For Git-flow promotion, use `/promote-release`.

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
Create and sync branches according to the Git Town rule above. Once the branches
exist, manage the stack with:

```bash
gh stack push                 # push the layers
gh stack submit --open        # create the PRs ready for review; never leave them as drafts
gh stack view                 # inspect layers, PR links, and status
```

Full command/flag reference: `gh stack --help` and GitHub's *Stacked pull
requests CLI commands* docs; the upstream `gh-stack` skill covers it in depth.

## Rules that matter

- **Keep layers linear.** Do not merge one PR branch into another. Follow the
  Git Town rule above for branch and target conventions.
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
- pr-standards (github-workflows) — PR creation guards, issue linking, human-review gate
- git-workflow-standards (git-workflows) — branch hygiene and worktree cleanup
- merge-pr (github-workflows) — merges the stack-aware way
- rebase-pr (github-workflows) — local rebase-merge for individual PRs
- prune-branches (github-workflows) — protects `--base` refs, so stack layers are safe
