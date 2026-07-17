---
name: pr-sweep
description: "Drive open PRs toward zero across one or many repos by risk-ranking every open PR, auto-merging the low-risk mergeable ones, and surfacing the rest with the exact reason each is held. Use when open PRs have piled up and you want them triaged and cleared in one pass. Batches over the existing /squash-merge-pr and /finalize-pr per PR — it decides which PRs are safe to merge and delegates the merge, it does not reimplement merging."
---

# PR Sweep

Take a pile of open PRs and drive it to zero: merge what is safe, surface what is
not with a specific reason. This is triage-and-clear, distinct from
`/refresh-repo --sweep` (which syncs repos and cleans worktrees). This skill acts
on **open PRs**; that one acts on **repo/worktree state**.

It does not reimplement merging. It **risk-ranks**, then hands each merge to
`/squash-merge-pr` (which itself runs the readiness gate and calls `/finalize-pr`).

> **State warning**: PR status, CI, and mergeability change between invocations.
> Re-list and re-check every PR in this run; never act on a cached list.

## Scope

- `/pr-sweep` — open PRs in the current repo.
- `/pr-sweep --org <owner>` — open PRs authored by you across the owner's repos
  (`gh search prs --owner <owner> --author @me --state open`).

Always list first, act second. State the count before touching anything.

## Step 1: List and gather signal

For every open PR, collect the merge-decision signals in one pass:

```bash
gh pr view <N> --json number,title,url,isDraft,mergeable,mergeStateStatus,\
reviewDecision,additions,deletions,changedFiles,labels,baseRefName,headRefName
```

Also resolve whether the repo is git-flow (default branch `develop`) — a
`develop → main` promotion PR is never swept (see Hold reasons).

## Step 2: Risk-rank each PR

Rank by blast radius and confidence, low to high:

| Risk | Signals |
| --- | --- |
| **Low** (auto-merge candidate) | `mergeable == MERGEABLE`, CI clean (`mergeStateStatus` CLEAN), not draft, no unresolved threads, small diff, docs/config/test-only or a bot dependency bump from a trusted source |
| **Medium** (surface, do not auto-merge) | app/library code, larger diff, passing CI but no review, or any label like `needs-review`/`blocked` |
| **High** (surface, flag loudly) | touches auth/secrets/migrations/infra, failing or pending CI, conflicts, or a `develop → main` promotion |

The bar for **auto-merge** is deliberately conservative: low risk **and** nothing
held. When unsure, rank up — a surfaced PR costs a glance; a wrongly-merged one
costs a revert.

## Step 3: Auto-merge the low-risk set

For each low-risk PR, delegate — do not merge by hand:

- Invoke **`/squash-merge-pr <N>`**. It re-runs the readiness gate, calls
  `/finalize-pr` for soft blocks, and aborts on hard stops. Trust its refusal: if
  it declines, the PR moves to the surfaced list with that reason.
- Never pass `--admin`, never bypass a failing check, never merge a draft.

## Step 4: Report

```text
PR Sweep — <scope>
  Swept (merged):   <N> — <title>   (× each)
  Held:             <N> — <reason: draft | CI red | conflicts | needs review | promotion | high-risk>
  Open before → after: <b> → <a>
```

Every PR is either merged or listed with a concrete reason — never silently
skipped. If nothing is low-risk, say so; a sweep that merges nothing is a valid
outcome, not a failure.

## Hold reasons (never auto-merge)

- Draft, failing/pending CI, merge conflicts, unresolved review threads.
- `develop → main` promotion PRs — use `/promote-release`.
- Anything touching auth, secrets, DB migrations, or live infra — a human decides.
- `/squash-merge-pr` refused — carry its reason forward verbatim.

## Related Skills

- **squash-merge-pr** (github-workflows) — performs each merge; this skill decides which.
- **finalize-pr** (github-workflows) — PR metadata/soft-block handling, via squash-merge-pr.
- **refresh-repo** (github-workflows) — the repo/worktree sweep; complementary, not this.
- **promote-release** (github-workflows) — the correct path for held promotion PRs.
