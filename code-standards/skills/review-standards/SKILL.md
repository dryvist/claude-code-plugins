---
name: review-standards
description: Use when performing formal code review on PRs
---

# Code Review Standards

## Review Focus Areas

When reviewing code, prioritize:

1. **Security vulnerabilities** and hardcoded secrets
2. **Performance implications** of algorithmic choices
3. **Maintainability** and code clarity
4. **Test coverage** and TDD compliance
5. **Documentation accuracy** and completeness
6. **DRY violations** and code duplication
7. **Standards compliance** per code-quality-standards

## PR Review Principles

- **Be pragmatic**: Perfect security that blocks all work is worse than
  reasonable security that enables productivity.
- **Trust context**: If a permission is requested for a legitimate workflow,
  assume good faith.
- **Quantify risk**: Ask "how often would this actually cause harm?" not
  "could this ever cause harm?"

## Permission & Configuration Reviews

Focus on likely failures, not theoretical edge cases. Do not reject based on
contrived scenarios unlikely in practice. Balance security with usability —
overly restrictive permissions that impede workflows are themselves a failure.

## Related Skills

- **code-quality-standards** (code-standards) — Use when writing or reviewing code and documentation
- **pr-standards** (github-workflows) — PR & issue standards, PR guards, issue linking
- **finalize-pr** (github-workflows) — Manage your PR through the full author flow
