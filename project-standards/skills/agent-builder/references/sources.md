# Builder guidance sources

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
folded into SKILL.md where this skill did not already carry them.

## Dated source register

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
| O9 | OpenAI, [Codex CLI 0.166.0 release notes](https://github.com/openai/codex/releases/tag/rust-v0.166.0) | Released 2026-10-29 | 2026-11-09 | Trace available skills, exact loaded versions, and loaded resource paths; attribute spans to turn, tool call, and skill. |
| O10 | OpenAI, [Codex CLI 0.167.0 release notes](https://github.com/openai/codex/releases/tag/rust-v0.167.0) | Released 2026-11-06 | 2026-11-09 | Commands that must never run unattended are managed checkpoints needing fresh approval on every run; never reuse an earlier approval. |
| G1 | Google ADK, [agent evaluation](https://github.com/google/adk-docs/blob/628ed49787f83414995efd1b68f927778bad673f/docs/evaluate/index.md) | Revised [2026-10-16](https://github.com/google/adk-docs/commit/628ed49787f83414995efd1b68f927778bad673f) | 2026-11-06 | Evaluate observable tool trajectories and final response separately; choose metrics appropriate to the task. |
| G2 | Google ADK, [safety and security](https://github.com/google/adk-docs/blob/3a29a8df6e30ca5e36793b91a5249607104f8ccb/docs/safety/index.md) | Revised [2026-09-22](https://github.com/google/adk-docs/commit/3a29a8df6e30ca5e36793b91a5249607104f8ccb) | 2026-11-06 | Constrain identity, tool actions, and network access; treat injected content as untrusted. |
| G3 | Google, [ADK Python v2.14.0 release notes](https://github.com/google/adk-python/releases/tag/v2.14.0) | Released 2026-11-04 | 2026-11-09 | Run skill scripts from validated paths with an argument list; give each tool-argument check an explicit comparison mode: exact, case-insensitive, numeric tolerance, or semantic. |
| G4 | Google Cloud, [five rules for evaluating agent skills](https://cloud.google.com/blog/topics/developers-practitioners/evaluate-agent-skills-before-they-bloat-your-context-window) | Published 2026-11-03 | 2026-11-09 | Keep fixtures, grading scripts, and answer keys outside the tested agent's workspace with a separate verifier; reject revisions without measured gain over the previous version. |
| G5 | Google Cloud, [four eval engineering lessons](https://cloud.google.com/blog/topics/developers-practitioners/four-eval-engineering-lessons) | Published 2026-10-16 | 2026-11-09 | Pair plan-only cases with authorized disposable sandbox execution; preserve turn boundaries, parallel-call batches, and injection timing. |
| C1 | LangChain, [LangSmith trajectories](https://www.langchain.com/blog/langsmith-trajectories-tracing) | Published 2026-09-24 | 2026-11-09 | Evaluate complete multi-turn sessions; deduplicate repeated messages in ordered trajectories and retain the underlying traces. |
| C2 | LangChain, [context engineering starts with retrieval](https://www.langchain.com/blog/context-engineering-starts-with-retrieval) | Published 2026-10-23 | 2026-11-09 | Offload large retrieval payloads behind pointers; preserve source URLs and dates with results; test that claims cite and match retrieved material. |
| C3 | LangChain, [evidence-grounded agent memory](https://www.langchain.com/blog/building-agent-memory-openwiki-graphs) | Published 2026-10-28 | 2026-11-09 | Compare persistent memory with retrieval alone before adopting it; report accuracy, citation consistency, latency, and full update cost. |
| F5 | Langfuse, [skill management](https://langfuse.com/changelog/2026-11-03-skill-management) | Published 2026-11-03 | 2026-11-09 | Link skill observations to the canonical skill revision without creating another source of truth. |
| F6 | Langfuse, [see when token usage is missing](https://langfuse.com/changelog/2026-11-06-retiring-tokenization) | Published 2026-11-06 | 2026-11-09 | Use provider-reported token usage or submitted costs; report missing usage separately from a missing price; never estimate either. |
| A18 | Anthropic, [mcp-builder](https://github.com/anthropics/skills/blob/main/skills/mcp-builder/SKILL.md) | Undated official source page | 2026-11-09 | Consistent action names, constrained schemas, structured outputs; tool granularity matched to caller workflows; accurate behavior annotations. |
| A20 | Anthropic, [components of agent memory](https://www.anthropic.com/research/components-of-agent-memory) | Published 2026-11-06 | 2026-11-09 | Stored rules carry evidence references and confirmed/unconfirmed status with an authorized correction path; one writer per shared source record; key facts preserved exactly. |
| A21 | Anthropic, [subagent folding](https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop) | Published 2026-10-22 | 2026-11-09 | Prefer one agent with progressively disclosed skills and tools; keep a subagent only for measured context bloat, fresh-context parallelism, selection conflicts, or permission boundaries. |
| A22 | Anthropic, [Claude Code v2.1.317 release notes](https://github.com/anthropics/claude-code/releases/tag/v2.1.317) | Released 2026-11-03 | 2026-11-09 | A failed action-gate callback blocks the protected action where the harness supports it; test that failure path. |
| A23 | Anthropic, [Claude Code 2.1.319](https://code.claude.com/docs/en/changelog#2-1-319) | Released 2026-11-06 | 2026-11-09 | A safeguard-stopped subagent is retried with a narrower prompt or reported; the parent never performs the blocked work. |
| A24 | Anthropic, [Claude Code v2.1.316 release notes](https://github.com/anthropics/claude-code/releases/tag/v2.1.316) | Released 2026-10-31 | 2026-11-09 | Set a subagent's or forked side job's effort explicitly for its job instead of inheriting the session's level. |
| A25 | Anthropic, [Claude Code v2.1.318 release notes](https://github.com/anthropics/claude-code/releases/tag/v2.1.318) | Released 2026-11-04 | 2026-11-09 | Run a subagent's long shell commands in the background so its foreground turn does not block while the prompt cache expires. |
| D9 | Dify, [export and import apps](https://docs.dify.ai/en/self-host/use-dify/workspace/export-import-apps) | Updated 2026-11-04 | 2026-11-09 | Export the intended published version explicitly; workflow, agent, and skill exports carry saved draft changes; record dependencies exports omit. |
| D11 | Dify, [skills](https://docs.dify.ai/en/self-host/use-dify/build/skills) | Updated 2026-10-26 | 2026-11-09 | Skill exports can contain saved draft changes; export the intended version explicitly. |
| D12 | Dify, [agent node](https://docs.dify.ai/en/cloud/use-dify/nodes/agent) | Updated 2026-10-28 | 2026-11-09 | Define exhaustive agent routes, an otherwise route, and failure handling for invalid results. |
| D13 | Dify, [AI agent or workflow](https://www.dify.ai/de/blog/ai-agent-or-workflow-how-to-choose-the-right-approach) | Published 2026-10-16 | 2026-11-09 | Workflows own schedules, branches, checks, approvals, and recovery; keep the agent to the bounded, evaluable variable step of a mostly fixed process. |
| D14 | Dify, [1.19.0 release notes](https://github.com/langgenius/dify/releases/tag/1.19.0) | Released 2026-11-04 | 2026-11-09 | Temporary credential-refresh failures return temporary-unavailable errors; request re-authorization only when the credential is invalid. |

Rendered Google guides: [evaluation](https://adk.dev/evaluate/) and
[safety](https://adk.dev/safety/), both undated and retrieved **2026-11-06**.
Their retrieval does not date the rendered content. Apply the practices through the existing
platform, without introducing ADK or a second evaluation framework.

A2's title, publication date, and `memory` and `agent` guidance were fetched
live on **2026-11-07**. The official [Claude resources site](https://claude.com/resources/articles)
links `claude.dev` as its developer blog, confirming the publisher.

## Findings at the base revision

Coverage is assessed against `2e9447d`, before this refresh. `A` means
agent-builder; `S` means skill-builder. This table records authoring coverage,
not measured runtime performance. Shared sources are registered once above;
skill-specific records live in [skill-builder sources](../../skill-builder/references/sources.md).

| Practice | Source | Date | Already follows? | Refresh coverage |
| --- | --- | --- | --- | --- |
| Narrow description triggers and exclusions | O1 | 2026-09-11 | yes | A/S retain discovery and clarify adjacent requests. |
| Progressive disclosure with inline safety | A1; E1 in skill sources | 2026-07-24; 2026-11-06 | partly | A/S link conditional evidence and retain safety inline. |
| Minimum tools and runtime permissions | A2, G2 | 2026-10-08; 2026-09-22 | partly | A/S distinguish tool metadata, enforcement, and approvals. |
| Pre-action checks across tool calls and handoffs | O2 | 2026-10-13 | no | A/S verify enforcement before effects. |
| Trigger tests separate from execution | G1; S1 in skill sources | 2026-10-16; 2026-03-06 | partly | A adds activation/exclusion/replay tests; S retains trigger metrics. |
| Baseline, clean trials, protected held-out cases | A3 | 2026-09-28 | yes | A/S retain reproducible comparisons and uncertainty. |
| Tool arguments and resulting state as evaluation targets | G1 | 2026-10-16 | partly | A/S grade observable actions without forcing one valid path. |
| Context accounting and bounded execution | A1, O3 | 2026-07-24; 2026-09-30 | no | A/S budget context and execution through native configuration. |
| Validated terminal and partial output contracts | O3 | 2026-09-30 | partly | A/S include schema checks, artifact references, and blocked reasons. |
| Shared definition defaults and focused roles | A1; E2 below | 2026-07-24; 2026-11-06 | partly | A extends shared-prefix reuse to profiles and defaults. |
| Dated rule provenance and refresh evidence | A3, O1 | 2026-09-28; 2026-09-11 | no | A/S add source registers and versioned development evals. |
| Read-only tool surface for read-only requests | O4 | 2026-11-09 | no | A exposes only read-only tools for read-only requests and leaves a no-tool answer available. |
| Subagent effort, background commands, and safeguard stops | A23, A24, A25 | 2026-10-31; 2026-11-04; 2026-11-06 | no | A contains safeguard-stopped work outside the parent, sets subagent effort explicitly, and backgrounds long commands. |
| Stored-rule evidence and single-writer memory | A20 | 2026-11-06 | no | A requires evidence references, status, authorized correction, and one writer per shared record. |
| Managed checkpoints needing fresh approval | O10 | 2026-11-06 | no | A/S mark unattended-forbidden commands as per-run checkpoints. |
| Workflow-versus-agent boundary and complete routing | D13; D12 | 2026-10-16; 2026-10-28 | no | A assigns schedules, branches, approvals, and recovery to workflows and requires exhaustive routes with an otherwise route. |
| Credential error semantics | D14 | 2026-11-04 | no | A returns temporary-unavailable for refresh failures; re-auth only for invalid credentials. |
| Retrieval pointers and citation matching | C2, A18 | 2026-10-23 | no | A offloads payloads behind pointers, keeps source URLs/dates, and tests citation matching. |
| Explicit tool-argument comparison modes | G3 | 2026-11-04 | no | A/S name exact, case-insensitive, numeric-tolerance, or semantic checks. |
| Plan-only cases paired with sandbox execution | G5 | 2026-10-16 | no | A/S grade actual arguments, artifacts, and unauthorized effects from paired runs. |
| Trajectory fidelity across sessions | C1, G5 | 2026-09-24; 2026-10-16 | no | A evaluates full sessions with preserved timing and deduplicated traces. |
| Trial workspace isolation and separate verification | G4 | 2026-11-03 | no | A/S keep fixtures and keys outside the tested agent's reach with a separate verifier. |
| Memory-versus-retrieval comparison | C3 | 2026-10-28 | no | A compares persistent memory with retrieval and reports the full cost. |
| Provider-reported cost usage | F6 | 2026-11-06 | no | A/S never estimate missing usage or a missing model price. |
| Export intent and draft contamination | D9, D11 | 2026-11-04; 2026-10-26 | no | A exports the intended published version explicitly. |

## Rule trace and local policy

- Establish contract: A1/O1 support focused scope; G2 supports least privilege.
- Canonical inputs, connector ownership, generated exports, routing, sandbox
  code work, tracing fields, and the 7-day promotion gate are retained local
  platform policy, not requirements attributed to a vendor.
- E2: [agent standards](https://github.com/dryvist/ai-llm-prompts/blob/main/auto-ai-agent/instructions/agentsmd/rules/on-demand/agent-standards.md),
  policy revision **2026-11-08**, retrieved **2026-11-09**; source IDs resolve through that
  policy's per-publisher Anthropic, OpenAI, ecosystem, and platform source files.
  Shared defaults follow the operator's DRY ruling of 2026-11-06. This refresh
  does not change the platform architecture.
- Tool/permission decisions: A2, A18, A20, O2, O4, O10, A23–A25, G2, C2, D14.
  Context and execution: A1, O1, O3. Subagent structure: A21.
  Numerical runtime budgets come from the task/runtime owner, not these sources.
- Render/evaluate: A3, G1, G3, G4, G5, C1, C3, F6; the existing promptfoo and
  Langfuse gates remain
  local requirements. Import/shadow/promotion and reporting retain those gates;
  O3 supports typed final/error results. Static validation proves structure only.
- Builder [native development cases](../../../evals/agent-builder/native/) are visible to the
  author. Independent evaluation owns the unseen acceptance cases and runs
  them through the [shared native protocol](../../../evals/skill-builder/contract.md).

## Conflicts retained explicitly

Anthropic A1 favors less repetition, while local `claude-skill-authoring`
requires safety rules to remain inline even when repeated. Keep that exception;
disclose reference material only. The local byte/token budgets take precedence
over upstream character/word recommendations; see E1 in the skill register.
SDK guardrails are reference semantics, not a mandate to add SDK code: use the
platform's existing enforcement and stop if it cannot enforce the boundary.
