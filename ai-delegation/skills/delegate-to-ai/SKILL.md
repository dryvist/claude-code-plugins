---
name: delegate-to-ai
description: Classify and bound delegated tasks, protect sensitive content, and verify the exact result before handoff.
---

# Delegate to AI

Use these checks before handing work to another executor.

## Prepare the task

Classify the task and its content before choosing an executor. Never send
secrets, credentials, private data, or other sensitive material to a
third-party executor.

Give the executor a bounded scope, the exact inputs it may use, and clear
acceptance criteria. Do not delegate authority to merge changes or make
security decisions.

## Verify the result

Treat every delegated result as untrusted. Inspect the exact artifact: review
the diff, confirm the expected commit or result SHA, and check factual claims
against the source material. Re-run the acceptance criteria before handoff.

The trusted caller keeps merging and security decisions.

## Related skills

- **local-subagents** (ai-delegation) — choose and call a local or low-cost model.
- **multi-model-review** (ai-delegation) — request independent review and synthesize findings.
- For the maintainer's own setup, use `jpe-ai-delegation:delegation-ladder`.
