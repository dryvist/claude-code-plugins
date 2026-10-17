---
name: shared-workflow-org-refs
description: "Use when creating or editing GitHub Actions workflows that call reusable workflows (uses: OWNER/repo/.github/workflows/...) — refs must name the literal current home, and shared-CI homes are under JacobPEvans."
---

# Shared Workflow Org References

GitHub Actions reusable-workflow and action `uses:` clauses must name the literal
current repository and path. References to transferred workflow homes need an
explicit update; Actions does not follow redirects.

Two hard GitHub constraints:

- `uses:` cannot contain expressions or variables — the owner is always a literal.
  `uses: ${{ vars.X }}/repo/...@ref` is rejected. No org variable can centralize it.
- `uses:` does NOT follow repository transfer/rename redirects (by design). API, git, and the browser DO follow them; Actions does not.

Consequence: when a shared-CI repo changes orgs, every consumer's `uses:` fails at parse time
(the run shows zero jobs and "workflow was not found"). There is no runtime variable that prevents this.

## Canonical workflow homes: JacobPEvans

Shared generic CI, release, lint, and Renovate configuration lives in
`JacobPEvans/.github`. AI review and agent workflows live in
`JacobPEvans/.github-ai`. Consumers use the mapped workflow path at `@v1`;
`uses:` references do not follow repository redirects.

| Shared workflow set | Current home |
| --- | --- |
| Generic CI, Nix, release, lint, and Renovate presets | `JacobPEvans/.github` |
| AI review and agent workflows | `JacobPEvans/.github-ai` |
| Release entry point (`_release.yml`) | `JacobPEvans/.github` |

## Rules

- In `uses:`, always reference the literal current owner above.
- Pin a dryvist reusable workflow to a full commit SHA, with the release tag as a trailing comment:
  `uses: dryvist/<repo>/.github/workflows/<file>@<40-hex-sha> # vX.Y.Z`. Never `@main`, `@develop`,
  or a bare `@vN`.
- Do NOT replace a reusable-workflow call with a `gh workflow run` / checkout `vars.*` dispatcher
  just to gain a variable: that loses required-check status, inputs/outputs, and `secrets: inherit`.

## If a shared-CI repo must move anyway (sweep)

1. `gh search code 'OLD_OWNER/REPO' --owner dryvist` (and `--owner JacobPEvans-personal`), filtered to `.github/workflows/*.yml`.
2. Per consumer repo: swap only the `uses:` owner segment, preserving path and `@ref`; one PR per repo.
3. Skip docs and files that are not reusable-workflow callers.
4. Token tiers: dryvist repos → DRYVIST; JacobPEvans-personal repos → PRIVATE.
