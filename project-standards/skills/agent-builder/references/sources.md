# Builder guidance sources

Research cutoff: **2026-11-06**; provenance clarified **2026-11-07**.
Audience: skill maintainers. Publication/revision dates and retrieval dates
have separate fields. Revisions identify the latest recorded commit touching
the named document; copyright, crawl, and retrieval dates do not establish
publication. Existing retrieval records are retained. Undated documentation
is supplementary. Sources older than 12 months are background only; none
supplies a new rule here. No practitioner sources are used.

## Dated source register

| ID | Official source | Published or revised | Retrieved | Rules applied |
| --- | --- | --- | --- | --- |
| A1 | Anthropic, [context engineering](https://claude.dev/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models/) | Published 2026-07-24 | 2026-11-06 | Task-specific context, progressive disclosure, tool-owned instructions, remove redundant scaffolding. |
| A2 | Anthropic, [agent automations](https://claude.dev/blog/building-effective-agent-automations/) | Published 2026-10-08 | 2026-11-06; reverified 2026-11-07 | Fresh read-only preferences with stop on unreadable input; pre-delivery status rechecks, source-field links, recorded unverifiable cuts; constrained sources/destinations, delivery confirmation and bookmarks. |
| A3 | Anthropic, [eval design and hillclimbing](https://claude.dev/blog/automating-eval-design-and-hillclimbing/) | Published 2026-09-28 | 2026-11-06 | Production tasks, calibrated graders, clean repeated trials, baselines, evaluator-owned held-out sets. |
| O1 | OpenAI, [skills and prompts](https://learn.chatgpt.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) | Published 2026-09-11 | 2026-11-06 | Narrow descriptions, outcome-driven instructions, measure changes instead of accumulating rules. |
| O2 | OpenAI Agents SDK, [guardrails](https://github.com/openai/openai-agents-python/blob/f53c62451c7f34c15f0c87fa745e05404025420f/docs/guardrails.md) | Revised [2026-10-13](https://github.com/openai/openai-agents-python/commit/f53c62451c7f34c15f0c87fa745e05404025420f) | 2026-11-06 | Input/output checks have different boundaries; use pre-action enforcement, verify handoffs and tool coverage. |
| O3 | OpenAI Agents SDK, [running agents](https://github.com/openai/openai-agents-python/blob/9d2b318dd034e5c0333c88e60ed6c704cbbbd04b/docs/running_agents.md) | Revised [2026-09-30](https://github.com/openai/openai-agents-python/commit/9d2b318dd034e5c0333c88e60ed6c704cbbbd04b) | 2026-11-06 | Bound turns and timeouts, shape history, handle terminal errors, preserve resumable state and validate final output. |
| G1 | Google ADK, [agent evaluation](https://github.com/google/adk-docs/blob/628ed49787f83414995efd1b68f927778bad673f/docs/evaluate/index.md) | Revised [2026-10-16](https://github.com/google/adk-docs/commit/628ed49787f83414995efd1b68f927778bad673f) | 2026-11-06 | Evaluate observable tool trajectories and final response separately; choose metrics appropriate to the task. |
| G2 | Google ADK, [safety and security](https://github.com/google/adk-docs/blob/3a29a8df6e30ca5e36793b91a5249607104f8ccb/docs/safety/index.md) | Revised [2026-09-22](https://github.com/google/adk-docs/commit/3a29a8df6e30ca5e36793b91a5249607104f8ccb) | 2026-11-06 | Constrain identity, tool actions, and network access; treat injected content as untrusted. |

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

## Rule trace and local policy

- Establish contract: A1/O1 support focused scope; G2 supports least privilege.
- Canonical inputs, connector ownership, generated exports, routing, sandbox
  code work, tracing fields, and the 7-day promotion gate are retained local
  platform policy, not requirements attributed to a vendor.
- E2: [agent standards](https://github.com/dryvist/ai-llm-prompts/blob/main/auto-ai-agent/instructions/agentsmd/rules/on-demand/agent-standards.md),
  policy revision **2026-11-06**, retrieved **2026-11-06**; its linked platform rules identify that policy and
  the R2 a–g source families. Shared defaults follow the operator's DRY ruling
  of the same date. This refresh does not change the platform architecture.
- Tool/permission decisions: A2, O2, G2. Context and execution: A1, O1, O3.
  Numerical runtime budgets come from the task/runtime owner, not these sources.
- Render/evaluate: A3, G1; the existing promptfoo and Langfuse gates remain
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
