# CodeQL Resolver

A Claude Code plugin that provides systematic analysis and resolution of CodeQL alerts in GitHub Actions workflows.

See [ARCHITECTURE.md](ARCHITECTURE.md) for cross-plugin integration diagrams.

## Overview

**CodeQL Resolver** implements a three-tier command→agent→skill architecture for managing GitHub security scanning alerts:

- **`/resolve-codeql`** - Main command for discovering, classifying, and delegating CodeQL alerts
- **3 Specialized Agents** - Permission auditor, expression injection fixer, generic resolver
- **2 Reusable Skills** - Permission classification, security patterns

## Key Features

### Alert Classification

Automatically categorizes CodeQL alerts by type:

- ✅ **Permissions** - "Workflow does not contain permissions"
- ✅ **Expression Injection** - Untrusted input in shell commands
- ✅ **Other** - Resource leaks, hardcoded credentials, etc.

### Specialized Agents

#### 1. Permissions Auditor

Fixes "Workflow does not contain permissions" alerts by:

- Analyzing reusable workflow call requirements
- Determining minimum permissions needed
- Adding explicit least-privilege blocks

**Test case**: [ci-gate.yml](https://github.com/JacobPEvans/ai-assistant-instructions/blob/main/.github/workflows/ci-gate.yml) -
Fixed 8 alerts with this agent's methodology

#### 2. Expression Injection Fixer

Mitigates GitHub Actions expression injection vulnerabilities by:

- Identifying dangerous untrusted inputs
- Wrapping in environment variables
- Following GitHub's official security guidance

#### 3. Generic Resolver

Handles other CodeQL alert types:

- Resource leaks, hardcoded credentials, unsafe shell
- Escalates unclear issues for human review
- Provides detailed analysis when patterns match

## Installation

### Option 1: Add via Marketplace (Recommended)

```bash
/plugin marketplace add /path/to/claude-code-plugins
/plugin install codeql-resolver@jacobpevans-plugins
```

### Option 2: Local Development

```bash
claude --plugin-dir /path/to/codeql-resolver
```

## Usage

### List All Alerts

```bash
/resolve-codeql
```

### Fix All Alerts

```bash
/resolve-codeql fix
```

### Fix Specific Alert Type

```bash
/resolve-codeql type:permissions     # Fix only permissions alerts
/resolve-codeql type:injection       # Fix only expression injection
/resolve-codeql type:other           # Fix other alert types
```

### Fix Specific File

```bash
/resolve-codeql file:.github/workflows/ci-gate.yml
```

## Architecture

```text
┌────────────────────────────────────┐
│   /resolve-codeql (Command)        │
│   - Discover alerts via GitHub API │
│   - Classify by type               │
│   - Delegate to specialists        │
│   - Verify fixes                   │
└────────────────┬───────────────────┘
                 │
         ┌───────┼───────┐
         │       │       │
         ▼       ▼       ▼
    ┌────────┬────────┬──────────┐
    │Perms   │Inject  │Generic   │
    │Auditor │Fixer   │Resolver  │
    └────────┴────────┴──────────┘
         │       │       │
         └───────┼───────┘
                 │
              Skills
         ┌──────────────────┐
         │ Permission       │
         │ Classification   │
         │                  │
         │ Workflow         │
         │ Security Patterns│
         └──────────────────┘
```

## Plugin Structure

```text
codeql-resolver/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── hooks/
│   └── hooks.json               # Hook configuration
├── agents/
│   ├── codeql-permissions-auditor.md
│   ├── codeql-expression-injector.md
│   └── codeql-generic-resolver.md
├── skills/
│   ├── codeql-permission-classification.md
│   └── github-workflow-security-patterns.md
├── commands/
│   └── resolve-codeql.md
└── README.md
```

## Examples

### Example 1: Fix ci-gate.yml Permissions

In `ai-assistant-instructions`:

```bash
/resolve-codeql file:.github/workflows/ci-gate.yml
```

**Output**:

```text
CodeQL Alert Resolution Report
===============================
File: .github/workflows/ci-gate.yml
Alerts found: 8 (permissions)

Fixing permissions on reusable workflow calls...
✓ cclint (line 103) - Added contents:read
✓ validate-cclint (line 109) - Added contents:read, pull-requests:write
✓ markdownlint (line 118) - Added contents:read
✓ spellcheck (line 124) - Added contents:read
✓ token-limits (line 130) - Added contents:read, pull-requests:write
✓ validate-instructions (line 146) - Added contents:read
✓ yaml-lint (line 152) - Added contents:read
✓ gate (line 160) - Added permissions:{}

Verification: Running CodeQL scan...
✓ All 8 alerts resolved!

Commit: "security: fix CodeQL alerts - add explicit permissions"
```

### Example 2: Fix Expression Injection

```bash
/resolve-codeql type:injection
```

**Output**:

```text
CodeQL Alert Resolution Report
===============================
Alert Type: Expression Injection

Analyzing vulnerable patterns...
Found 1 alert in .github/workflows/deploy.yml:45

Fixing expression injection...
✓ Added env: block for PR_BODY variable
✓ Updated script to use $PR_BODY instead of untrusted expression

Verification: ✓ Alert resolved!

Commit: "security: fix CodeQL - mitigate expression injection"
```

## Real-World Test Case

The plugin was designed with [PR #413](https://github.com/JacobPEvans/ai-assistant-instructions/pull/413) as a real test case:

- **Starting point**: 8 CodeQL alerts in ci-gate.yml
- **Issue**: Missing `permissions:` blocks on reusable workflow calls
- **Solution**: Permissions auditor agent analyzed each job and added appropriate blocks
- **Result**: All 8 alerts resolved with single commit

## Security Principles

All fixes follow these security principles:

1. **Least Privilege** - Requests only minimum permissions needed
2. **Explicit Over Implicit** - Declares permissions explicitly rather than relying on defaults
3. **Auditable** - All changes follow documented patterns and are reviewable
4. **Safe By Default** - Expression injection vulnerabilities wrapped in env vars
5. **Escalation** - Unclear issues flagged for human review, not auto-fixed

## References

- [GitHub Security Blog: Catching GitHub Actions Workflow Injections](https://github.blog/security/vulnerability-research/how-to-catch-github-actions-workflow-injections-before-attackers-do/)
- [GitHub Actions Security: Best Practices](https://docs.github.com/en/actions/security-guides)
- [CodeQL Rules Documentation](https://docs.github.com/en/code-security/codeql)

## Development

### Local Testing

```bash
python3 codeql-resolver/scripts/test_codeql_plugin.py
```

### Adding New Alert Types

1. Create new agent in `agents/codeql-{type}-resolver.md`
2. Add to `plugin.json` agents list
3. Update `/resolve-codeql` command to delegate to new agent
4. Create corresponding skill if pattern is reusable
5. Add tests in `scripts/test_codeql_plugin.py`

## Contributing

See [CONTRIBUTING.md](../docs/CONTRIBUTING.md)

## License

Apache 2.0
