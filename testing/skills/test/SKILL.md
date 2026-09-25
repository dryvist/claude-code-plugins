---
name: test
description: Dispatch browser and UI test work to the specialized testing agent that matches the requested outcome.
---

# test

Choose one testing agent, then run it as a subagent with the target, mode, and
acceptance criteria in its prompt:

| Need | Agent |
| --- | --- |
| Run deterministic Playwright checks or inspect screenshots | `ui-smoke` |
| Design or update a spec | `spec-author` |
| Classify a failed check and repair a stale selector | `healer` |
| Inspect browser performance, console, or network behavior | `perf-debug` |
| Explore a browser flow without deciding a gate | `explorer` |

Use the testing-agents plugin for the selected agent. Keep deterministic
Playwright results as the gate; `explorer` uses Browser Use only for
non-gating investigation.

`perf-debug` runs in its dedicated local-agent environment. Claude plugin
agents ignore `mcpServers` frontmatter, so do not expect this dispatcher to
load Chrome DevTools MCP tools into the main session.
