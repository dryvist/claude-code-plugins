# Builder guidance sources

## Contents

- [Dated source register](#dated-source-register)
- [Ecosystem and research register](sources-ecosystem.md)
- [Findings and rule trace](findings.md)

Research cutoff: **2026-11-06**; provenance clarified **2026-11-07**.
Audience: skill maintainers. Publication/revision dates and retrieval dates
have separate fields. Revisions identify the latest recorded commit touching
the named document; copyright, crawl, and retrieval dates do not establish
publication. Existing retrieval records are retained. Undated documentation
is supplementary. Sources older than 12 months are background only; none
supplies a new rule here. No practitioner sources are used.
Reverified **2026-11-09**: A1–A3 match their registered publication dates,
O1 is unchanged, O2 (`f53c624`, 2026-10-13) and O3 (`9d2b318`,
2026-09-30) remain the latest revisions touching those documents, and the
2026-10-22 subagent-folding article is unchanged. The current Agent Skills
documentation (see S6 in the [skill-builder register](../../skill-builder/references/sources.md))
confirms the name/description limits and body-length guidance this estate
applies to skills. No registered source contradicts this skill's rules. The
recheck also registered O4, revised **2026-11-09** and dated after this
refresh, and SKILL.md now applies its read-only tool-surface rule.
Refreshed **2026-11-09** against the **2026-11-08** agent-standards
revision: its source IDs resolve through per-publisher Anthropic, OpenAI,
ecosystem, and platform files, and the rules below were registered and
folded into SKILL.md where this skill did not already carry them. The same
pass registered A13, D5, and D7 for the applied rules, and the shared
evaluation-conduct rules are owned once by skill-builder and applied here
by reference; the same pass registered R1 for the calibration position-bias
check and moved the grader-calibration protocol's single home into
skill-builder.

## Dated source register

This file registers the model and platform vendor sources. Ecosystem,
evaluation-framework, release, and research records live in the
[ecosystem and research register](sources-ecosystem.md); authoring coverage
and the rule trace live in [findings](findings.md).

| ID | Official source | Published or revised | Retrieved | Rules applied |
| --- | --- | --- | --- | --- |
| A1 | Anthropic, [context engineering](https://claude.dev/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models/) | Published 2026-07-24 | 2026-11-06 | Task-specific context, progressive disclosure, tool-owned instructions, remove redundant scaffolding. |
| A2 | Anthropic, [agent automations](https://claude.dev/blog/building-effective-agent-automations/) | Published 2026-10-08 | 2026-11-06; reverified 2026-11-07 | Fresh read-only preferences with stop on unreadable input; pre-delivery status rechecks, source-field links, recorded unverifiable cuts; constrained sources/destinations, delivery confirmation and bookmarks. |
| A3 | Anthropic, [eval design and hillclimbing](https://claude.dev/blog/automating-eval-design-and-hillclimbing/) | Published 2026-09-28 | 2026-11-06 | Production tasks, calibrated graders, clean repeated trials, baselines, evaluator-owned held-out sets. |
| O1 | OpenAI, [skills and prompts](https://learn.chatgpt.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) | Published 2026-09-11 | 2026-11-06 | Narrow descriptions, outcome-driven instructions, measure changes instead of accumulating rules. |
| O2 | OpenAI Agents SDK, [guardrails](https://github.com/openai/openai-agents-python/blob/f53c62451c7f34c15f0c87fa745e05404025420f/docs/guardrails.md) | Revised [2026-10-13](https://github.com/openai/openai-agents-python/commit/f53c62451c7f34c15f0c87fa745e05404025420f) | 2026-11-06 | Input/output checks have different boundaries; use pre-action enforcement, verify handoffs and tool coverage. |
| O3 | OpenAI Agents SDK, [running agents](https://github.com/openai/openai-agents-python/blob/9d2b318dd034e5c0333c88e60ed6c704cbbbd04b/docs/running_agents.md) | Revised [2026-09-30](https://github.com/openai/openai-agents-python/commit/9d2b318dd034e5c0333c88e60ed6c704cbbbd04b) | 2026-11-06 | Bound turns and timeouts, shape history, handle terminal errors, preserve resumable state and validate final output. |
| O4 | OpenAI Agents SDK, [agents](https://github.com/openai/openai-agents-python/blob/21ec412130103e7ffcc3fdf4c1368caba7fe9fe1/docs/agents.md) | Revised [2026-11-09](https://github.com/openai/openai-agents-python/commit/21ec412130103e7ffcc3fdf4c1368caba7fe9fe1) | 2026-11-09 | For a read-only request, expose only read-only tools; forcing a call over write-capable tools can change state on the first use. Leave the agent able to answer without calling a tool. |
| O8 | OpenAI, [harness-aware evaluation of plugins](https://developers.openai.com/cookbook/examples/partners/harness_aware_plugin_evals/harness_aware_plugin_evals) | Published 2026-09-23 | 2026-11-09 | Replay shared fixtures through each runner type; locate guidance and tool-availability differences before editing instructions. |
| O9 | OpenAI, [Codex CLI 0.166.0 release notes](https://github.com/openai/codex/releases/tag/rust-v0.166.0) | Released 2026-10-29 | 2026-11-09 | Attribute trace spans to turn, tool call, and skill. |
| O10 | OpenAI, [Codex CLI 0.167.0 release notes](https://github.com/openai/codex/releases/tag/rust-v0.167.0) | Released 2026-11-06 | 2026-11-09 | Commands that must never run unattended are managed checkpoints needing fresh approval on every run; never reuse an earlier approval. |
| A13 | Anthropic, [define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) | Undated official page | 2026-11-09 | Tool definitions describe purpose, applicability, parameters, results, and limitations; repeated system-prompt instructions move into the definition. |
| A18 | Anthropic, [mcp-builder](https://github.com/anthropics/skills/blob/main/skills/mcp-builder/SKILL.md) | Undated official source page | 2026-11-09 | Consistent action names, constrained schemas, structured outputs; tool granularity matched to caller workflows; composability preserved; accurate behavior annotations including open-world behavior. |
| A20 | Anthropic, [components of agent memory](https://www.anthropic.com/research/components-of-agent-memory) | Published 2026-11-06 | 2026-11-09 | Stored rules carry evidence references and confirmed/unconfirmed status with an authorized correction path; one writer per shared source record; key facts preserved exactly. |
| A21 | Anthropic, [subagent folding](https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop) | Published 2026-10-22 | 2026-11-09 | Prefer one agent with progressively disclosed skills and tools; keep a subagent only for measured context bloat, fresh-context parallelism, selection conflicts, or permission boundaries. |
| A22 | Anthropic, [Claude Code v2.1.317 release notes](https://github.com/anthropics/claude-code/releases/tag/v2.1.317) | Released 2026-11-03 | 2026-11-09 | A failed action-gate callback blocks the protected action where the harness supports it; test that failure path. |
| A23 | Anthropic, [Claude Code 2.1.319](https://code.claude.com/docs/en/changelog#2-1-319) | Released 2026-11-06 | 2026-11-09 | A safeguard-stopped subagent is retried with a narrower prompt or reported; the parent never performs the blocked work. |
| A24 | Anthropic, [Claude Code v2.1.316 release notes](https://github.com/anthropics/claude-code/releases/tag/v2.1.316) | Released 2026-10-31 | 2026-11-09 | Set a subagent's or forked side job's effort explicitly for its job instead of inheriting the session's level. |
| A25 | Anthropic, [Claude Code v2.1.318 release notes](https://github.com/anthropics/claude-code/releases/tag/v2.1.318) | Released 2026-11-04 | 2026-11-09 | Run a subagent's long shell commands in the background so its foreground turn does not block while the prompt cache expires. |

A2's title, publication date, and `memory` and `agent` guidance were fetched
live on **2026-11-07**. The official [Claude resources site](https://claude.com/resources/articles)
links `claude.dev` as its developer blog, confirming the publisher.
