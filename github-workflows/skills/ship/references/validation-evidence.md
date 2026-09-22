# Post validation evidence (agent-validated)

Reference detail for `ship` Step 3. Loaded on demand.

After both gates pass for a PR, record the evidence so a later session can
trust the change without re-verifying (refs
dryvist/ai-assistant-instructions#749):

```bash
head_sha=$(gh pr view <PR_NUMBER> --json headRefOid --jq '.headRefOid')
gh api "repos/{owner}/{repo}/statuses/$head_sha" \
  -f state=success -f context=agent-validated \
  -f description="<one line: what was verified (gates, CI, tests run)>" \
  -f target_url="$(gh pr view <PR_NUMBER> --json url --jq '.url')"
gh label create "validated:pass" --color 0e8a16 \
  --description "agent-validated status is success on head SHA" 2>/dev/null || true
gh pr edit <PR_NUMBER> --remove-label "validated:pending" \
  --remove-label "validated:fail" --add-label "validated:pass" 2>/dev/null || true
```

If a PR ends blocked or failing instead, post `state=failure` with a
description of what failed and set `validated:fail` the same way.

The **commit status is the machine truth** — it is bound to the exact head
SHA. The `validated:*` label is only a human-visible mirror and goes stale
the moment new commits land; never trust the label over the status.
