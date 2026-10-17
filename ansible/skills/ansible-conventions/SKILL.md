---
name: ansible-conventions
description: Use when creating, reviewing, linting, testing, versioning, or releasing Ansible playbooks, roles, inventories, or collections; apply the documented repository conventions.
---

# Ansible Repository Conventions

## Start with repository ownership

- Read the repository's `AGENTS.md` and follow its ownership map. Keep changes in the repository that owns the playbook, role, inventory, or collection.
- Follow the documented layout. When present, use `playbooks/` for orchestration,
  `roles/` for reusable configuration, `inventory/` for inventory resolution,
  and `docs/agents/` for repository guidance.
- Keep shared role and collection dependencies in `requirements.yml`. When it
  declares both collections and roles, install both with
  `ansible-galaxy install -r requirements.yml`.

## Lint and test

- Run `ansible-lint` and `ansible-playbook --syntax-check <playbook>` for the affected content.
- Run the repository's documented Molecule scenario with
  `molecule test -s <scenario>`. Follow CI's changed-role selection and run
  the full matrix at the documented promotion boundary.
- Use repository-provided fast and extended test tiers; do not replace a failing check with a weaker command.

## Shared workflows and versions

- Call shared reusable workflows from `JacobPEvans/.github` at `@v1`.
- When a repository consumes `dryvist/homelab-contracts`, use a major-version
  release tag and follow that repository's pinning policy. Do not consume a
  moving branch.
- Keep dependency versions in their documented single source of truth.

## Secrets

- Resolve secrets from OpenBao at runtime. Never commit secret values, plaintext secret files, rendered credentials, or tokens.
- Keep roles independent of the secret injector; read values through the repository's documented runtime interface.

## Do not

- Move a role or playbook across repository ownership boundaries without updating the owning project.
- Put environment-specific host data or credentials in public defaults or committed inventory.
- Run a broad converge for a scoped development change; use the documented tags, limits, and test tiers.
