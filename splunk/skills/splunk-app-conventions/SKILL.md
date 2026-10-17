---
name: splunk-app-conventions
description: Use when creating, reviewing, validating, versioning, or releasing Splunk apps, packages, or deployment automation; follow documented repository conventions.
---

# Splunk App Conventions

## Follow repository ownership and layout

- Read the repository's `AGENTS.md` and follow its source-of-truth map. Do not assume an app layout when the repository does not document one.
- In the Ansible deployment repository, keep automation in `playbooks/`,
  inventory loading in `inventory/`, and reusable deployment logic in
  `roles/splunk_docker/`. Keep index definitions in the role defaults and
  add-on and integration registries in the role vars.
- Keep shared pipeline definitions separate from app source. The shared app
  pipelines validate packages, deploy to nonproduction, compare packages with
  production, and publish versioned releases.

## Validate and test

- Run `ansible-lint` for Ansible deployment changes.
- When changing the shared pipeline repository, run `python -m unittest discover -s tests -p "test_*.py"` from its root.
- Use the app repository's package-validation pipeline before release; do not infer an app-specific local test command from another repository.

## Shared workflows and versions

- Call shared reusable workflows from `JacobPEvans/.github` at `@v1`.
- When a repository consumes `dryvist/homelab-contracts`, use a major-version release tag and follow the repository's dependency pinning policy.
- Keep app packages versioned through the documented release pipeline.

## Secrets

- Resolve deployment secrets from OpenBao at runtime. Never commit credentials, tokens, or plaintext secret files.
- Keep generated app archives out of tracked deployment source when the repository marks them as generated or ignored.

## Do not

- Guess undocumented paths, package commands, or ownership boundaries.
- Store secret values in app configuration, pipeline source, or committed artifacts.
- Duplicate deployment-owned configuration in app packages without a documented reason.
