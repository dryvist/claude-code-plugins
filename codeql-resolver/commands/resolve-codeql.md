---
description: Analyze and resolve CodeQL alerts systematically
model: sonnet
author: JacobPEvans
allowed-tools: Task, TaskOutput, Bash(gh *), Bash(git *), Read, Grep, Glob, TodoWrite
---

# Resolve CodeQL

Fix CodeQL alerts in **current repository only** by analyzing, classifying, and delegating to specialized agents.

## Scope Options

| Usage | Scope | Batch Size |
|-------|-------|-----------|
| `/resolve-codeql` | List all alerts | N/A |
| `/resolve-codeql fix` | Fix all alerts | 5 |
| `/resolve-codeql type:permissions` | Permissions alerts only | 5 |
| `/resolve-codeql type:injection` | Expression injection only | 5 |
| `/resolve-codeql type:other` | Other alert types | 5 |
| `/resolve-codeql file:path/to/workflow.yml` | Specific file only | N/A |

## Related

- `codeql-permissions-auditor` agent - Fix missing permissions
- `codeql-expression-injector` agent - Mitigate injection vulnerabilities
- `codeql-generic-resolver` agent - Handle other alert types
- `codeql-permission-classification` skill - Permission requirements
- `github-workflow-security-patterns` skill - Security patterns

## Workflow

### Phase 1: Alert Discovery & Classification

Replace `<OWNER>` and `<REPO>` before running.

This endpoint needs a token carrying **`security_events: read`** (App
installation) or the `security_events` scope (classic PAT). Without it the call
returns `403 Resource not accessible by integration`. That is a credential gap,
not an empty alert list — never read it as "no alerts". See the
`gh-cli-patterns` skill for how to tell that 403 apart from the one meaning
code scanning is simply disabled.

```bash
gh api 'repos/<OWNER>/<REPO>/code-scanning/alerts?state=open&per_page=100' --paginate \
  --jq '.[] | {
    number,
    rule: .rule.id,
    severity: .rule.severity,
    location: .most_recent_instance.location.path,
    message: .most_recent_instance.message.text
  }'
```

Group results by rule type:

- `actions/missing-workflow-permissions` -> Permissions category
- `actions/expression-injection` -> Expression injection category
- Others -> Generic category

Apply scope filter (if provided):

- `type:permissions`, `type:injection`, `type:other`
- `file:<path>` - only alerts in specific file

Report: N permissions, N injection, N other

### Phase 2: Delegate to Specialists

Based on alert classification:

```text
Permissions alerts (0-N)
  ├─> Batch 1 (max 5) → codeql-permissions-auditor agent
  ├─> Batch 2 (max 5) → codeql-permissions-auditor agent
  └─> ...

Expression injection alerts (0-N)
  ├─> Batch 1 (max 5) → codeql-expression-injector agent
  └─> ...

Other alerts (0-N)
  └─> Batch 1 (max 5) → codeql-generic-resolver agent
```

Invoke `superpowers:dispatching-parallel-agents` for parallel execution patterns.

Each agent receives:

- Alert numbers (array)
- File paths affected
- Instructions to fix, commit, and return summary

### Phase 3: Verification & Reporting

After all agents complete:

1. Re-run alert discovery
2. Compare before/after counts
3. Verify fixes committed to local branch
4. Report summary:

   ```text
   CodeQL Resolution Report
   ======================
   Repository: <OWNER>/<REPO>

   FIXED:
   - 8 alerts in .github/workflows/ci-gate.yml
   - 0 alerts in .github/workflows/deploy.yml

   NEEDS REVIEW:
   - 2 alerts in .github/workflows/notify.yml

   Total: 8 fixed, 2 needs review

   Next steps:
   1. Verify all fixes: git diff
   2. Create PR: /finalize-pr
   ```

## Success Criteria

- All permissible alerts are fixed
- Changes are committed with descriptive messages
- CodeQL verification confirms alerts resolved
- No new alerts introduced by fixes

## Error Handling

- If GitHub API unavailable: Report error, don't proceed
- If agent fails 3 times: Mark PR/file as "needs human review"
- If alert is unresolvable: Flag "escalation needed" with analysis
- If workspace has uncommitted changes: Abort with warning

## Notes

- Always use least-privilege principle for permissions
- Expression injection fixes must follow GitHub's official guidance
- Unclear patterns -> Escalate for human review, don't guess
- Each fix should be a separate commit per alert or file
