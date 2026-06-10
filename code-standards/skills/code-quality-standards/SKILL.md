---
name: code-quality-standards
description: Use when writing or reviewing code and documentation
---

# Code Quality Standards

## Core Principles

- **Readability**: Clear, self-documenting code. Clarity over cleverness.
- **Naming**: Descriptive, concise names for variables, functions, classes.
- **DRY**: Encapsulate reusable logic. Define once, reference everywhere.
- **Comments**: Explain *why*, not *what*.
- **Security**: No hardcoded secrets. Least privilege. Validate all input.
- **TDD**: Write failing tests before implementation. Red-green-refactor.
- **Idempotency**: Operations must be safely repeatable with consistent results.

## Language Rules

### Python

- Follow PEP 8. Use type hints for all function signatures.
- Write docstrings for all functions/classes/modules.
- Use `logging` module, never `print()`.
- Pin dependencies for apps (lock file); use ranges for libraries.
- Run `black`, `flake8`, `mypy` before committing.

### Bash / Shell

Baseline tool-selection rules are auto-loaded from ai-assistant-instructions
`agentsmd/rules/tool-use.md`; this skill adds review-time strictness.

- **NEVER use `for` loops** — breaks permission matching, requires interactive
  prompts. Use parallel tool calls or tool-native batch operations instead.
- **NEVER generate scripts** — execute commands directly via tool calls.

### JavaScript / TypeScript

- Use TypeScript for all new JS code. Prefer `const` over `let`, avoid `var`.
- Implement proper error boundaries in React components.

## Logging Standards

Format: `YYYY-MM-DD HH:mm:ss [LEVEL] {message}`

| Level | Use |
| --- | --- |
| ERROR | System failures, exceptions requiring attention |
| WARN | Unexpected but recoverable conditions |
| INFO | Normal operational messages |
| DEBUG | Detailed diagnostic information |

Include context (operation, user, resource). Never log secrets.

## Testing Philosophy

Prefer **continuous real-time monitoring** over one-time tests.

| Use Continuous Monitoring | Use One-Time Tests |
| --- | --- |
| Services with health endpoints | IaC validation (`terraform validate`) |
| Long-running infrastructure | Linting/formatting (pre-commit) |
| Anything that can fail post-deploy | Unit tests (TDD cycle) |

Monitoring MUST proactively alert. Alerting channels (priority order):
Slack, Splunk alerts, email. Silent dashboards are not monitoring.

## Documentation Format

- Use standard Markdown with proper syntax highlighting.
- Hierarchical numbering (1., 1.1., 1.1.1.) for structured content.
- Link to other docs instead of duplicating (DRY).
- Keep docs concise — AI-first, humans second.
- All Markdown validated by `markdownlint-cli2` via pre-commit hooks.

## Related Skills

- **review-standards** (code-standards) — Use when performing formal code review on PRs
- **pr-standards** (git-standards) — PR & issue standards, PR guards, issue linking
