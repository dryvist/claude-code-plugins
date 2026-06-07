---
name: delegate-to-ai
description: Route tasks to external AI models via Bifrost and PAL MCP multi-model tools
---

# Delegate to External AI

Routes tasks to specialized models based on task type using Bifrost (single-model) or PAL MCP (multi-model).

## When to Delegate

Delegate when Claude is not the best tool:

- **Large context** (1M+ tokens) -> cloud large-context tier via Bifrost (auto-routed)
- **Math/reasoning** -> a reasoning-capable model via Bifrost (auto-routed)
- **Private/offline** -> Local MLX via Bifrost (port 30080 routes to local MLX server)
- **Code review consensus** -> Multi-model via PAL `consensus`
- **Parallel multi-model research** -> PAL `clink` (when you need multiple model perspectives simultaneously)
- **Architecture planning** -> Claude Opus native subagent (Plan mode or `Plan` subagent type)

## Route Selection

Local models are named by **capability role**, not physical id. Roles resolve to the
resident model via the ai-stack registry (`~/.config/ai-stack/registry.json`, written by
nix-ai); never hardcode a physical model id here — when the resident model changes, only
the registry changes. Cloud tiers are capability classes; PAL/Bifrost auto-routes each to
a current model.

| Task Type | Cloud tier | Local role | Route |
| --- | --- | --- | --- |
| Research (single) | large-context | `large-context` | Bifrost |
| Research (multi) | multiple | `large-context`¹ | PAL clink |
| Complex Coding | Claude Opus | `coding` | native subagent |
| Fast Tasks | Claude Sonnet | `quickest` | Bifrost |
| Code Review | multi-model | `most-capable` | PAL consensus |
| Architecture | Claude Opus | `most-capable` | native subagent |

**Bifrost endpoint**: `http://localhost:30080/v1/chat/completions` (OpenAI-compatible)

¹ In local-only mode, `PAL clink` (multi-model) falls back to the single resident local model (every role resolves to it).

## PAL MCP Tools (multi-model only)

- **`clink`** - Parallel queries across multiple models
- **`consensus`** - Multi-model agreement for critical decisions

All other PAL tools have native Claude Code equivalents — use Bifrost or native subagents instead.

## Workflow

1. **Identify task type** (research, coding, review, architecture)
2. **Select route**: Bifrost for single-model, PAL for multi-model, native subagent for implementation work
3. **Execute**: Bifrost via `curl`/Bash; PAL via MCP tool call; native subagent via Agent tool
4. **Synthesize results** if using multi-model tools

## Local-Only Mode

When `localOnlyMode` is enabled or `--local` flag is passed, route all tasks through
Bifrost to the local MLX inference server (overrides native subagent rows). No cloud API calls are made.

## Related Skills

- auto-maintain (ai-delegation)
