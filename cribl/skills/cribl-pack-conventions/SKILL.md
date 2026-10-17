---
name: cribl-pack-conventions
description: Use when creating, reviewing, validating, testing, versioning, or releasing a Cribl Stream or Edge pack; apply the pack repository conventions.
---

# Cribl Pack Conventions

## Keep the pack boundary clear

- Read the pack repository's `AGENTS.md` before editing. Keep pack-specific
  changes in the pack repository and propose generic template changes in the
  template repository.
- Treat `default/` as pack configuration, `scripts/` as validation and build tooling, and `tests/` as the test harness when those paths exist.
- Keep workflow logic in reusable workflows or `scripts/*.sh`; do not embed inline scripts in workflows.

## Validate and test

- Run `yamllint` against `default/` with the repository's `.yamllint.yml`.
- Run `./scripts/validate-pack-structure.sh`.
- In `tests/`, run `pnpm install --frozen-lockfile`, `pnpm run lint`, `pnpm run typecheck`, and `pnpm run test`.
- Use the repository's configured Cribl version matrix; required test legs gate changes, while optional legs remain best-effort.

## Release and version

- Use the repository's release-please flow to propose versions. Do not create version tags manually.
- Use the template-provided reusable test and release workflows for pack validation and `.crbl` artifact publishing.
- Call shared repository-level reusable workflows from `JacobPEvans/.github` at `@v1`.

## Secrets

- Resolve secrets from OpenBao at runtime. Never commit credentials, tokens, or plaintext secret files.
- Keep test credentials in the isolated test environment; do not put them in pack defaults or workflow source.

## Do not

- Edit generic template files directly in a pack repository.
- Add inline shell scripts to workflows; extract scripts to `scripts/` or use a maintained action.
- Hand-create release tags or bypass a required test leg.
