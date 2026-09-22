---
name: code-quality-standards
description: Use when writing or reviewing code, choosing a logging format, or deciding between continuous monitoring and one-time tests in this estate
---

# Code Quality Standards

Generic code-quality and review practice is covered by
`superpowers:receiving-code-review` and the official `code-review:code-review`
and `engineering:code-review` skills. This skill holds only what's specific
to this estate.

## Bash / Shell

- **NEVER use `for` loops** — breaks permission matching in this harness,
  requires interactive prompts. Use parallel tool calls or tool-native batch
  operations instead.
- **NEVER generate scripts** — execute commands directly via tool calls (see
  `native-first`, script-guards).

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

- Hierarchical numbering (1., 1.1., 1.1.1.) for structured content.
- Keep docs concise — AI-first, humans second.
- All Markdown validated by `markdownlint-cli2` via pre-commit hooks.

## Related Skills

- **pr-standards** (github-workflows) — PR & issue standards, PR guards, issue linking
