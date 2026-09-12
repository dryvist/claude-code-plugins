---
description: Enforce standard formatting for all .claude/rules/ files
paths:
  - ".claude/rules/**"
---

# Rule Formatting Standard

All `.claude/rules/*.md` files must include YAML frontmatter with:

- **`description`** (required): One-line summary of what the rule enforces
- **`paths`** (required when file-scoped): Array of glob patterns restricting when the rule loads

`paths` is the key Claude Code's native rule loader reads
(<https://code.claude.com/docs/en/memory#path-specific-rules>). A rule without
`paths` loads unconditionally in every session. `globs` is not read by Claude
Code — it is the source-tier key of the `rulesync` translator, so it belongs only
in a rulesync source tree, never in a file that Claude Code loads directly.

Rules that apply only when specific files are edited must use `paths` to scope them.
Rules that apply universally (process guidance, conventions) omit `paths` but still require `description`.

```yaml
---
description: Brief description of the rule
paths:
  - "path/to/relevant/**"
---
```
