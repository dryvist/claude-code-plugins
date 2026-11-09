# Findings and rule trace

Authoring coverage at the base revision, the rule trace, and retained
conflicts for the builder guidance registers: the vendor records live in
[builder guidance sources](sources.md), and the ecosystem and research
records live in the [ecosystem and research register](sources-ecosystem.md).

## Contents

- [Vendor register](sources.md)
- [Ecosystem and research register](sources-ecosystem.md)
- [Findings at the base revision](#findings-at-the-base-revision)
- [Rule trace and local policy](#rule-trace-and-local-policy)
- [Conflicts retained explicitly](#conflicts-retained-explicitly)

## Findings at the base revision

Coverage is assessed against `2e9447d`, before this refresh. `A` means
agent-builder; `S` means skill-builder. This table records authoring coverage,
not measured runtime performance. Shared sources are registered once in the
[vendor register](sources.md) and the
[ecosystem and research register](sources-ecosystem.md); skill-specific
records live in [skill-builder sources](../../skill-builder/references/sources.md).

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
| Managed checkpoints needing fresh approval | O10 | 2026-11-06 | no | S owns the per-run checkpoint rule; A applies it through skill-builder's enforcement guidance. |
| Workflow-versus-agent boundary and complete routing | D13; D12 | 2026-10-16; 2026-10-28 | no | A assigns schedules, branches, approvals, and recovery to workflows and requires exhaustive routes with an otherwise route. |
| Credential error semantics | D14 | 2026-11-04 | no | A returns temporary-unavailable for refresh failures; re-auth only for invalid credentials. |
| Retrieval pointers and citation matching | C2, A18 | 2026-10-23 | no | A offloads payloads behind pointers, keeps source URLs/dates, and tests citation matching. |
| Explicit tool-argument comparison modes | G3 | 2026-11-04 | no | S owns the comparison-mode rule; A applies it through skill-builder's evaluation contract. |
| Plan-only cases paired with sandbox execution | G5 | 2026-10-16 | no | S owns plan-only pairing; A applies it through skill-builder's evaluation contract. |
| Trajectory fidelity across sessions | C1, G5 | 2026-09-24; 2026-10-16 | no | S owns session-fidelity rules; A applies them through skill-builder's evaluation contract. |
| Trial workspace isolation and separate verification | G4 | 2026-11-03 | no | S owns trial isolation; A applies it through skill-builder's evaluation contract. |
| Memory-versus-retrieval comparison | C3 | 2026-10-28 | no | A compares persistent memory with retrieval and reports the full cost. |
| Provider-reported cost usage | F6 | 2026-11-06 | no | S owns usage honesty; A applies it through skill-builder's evaluation contract. |
| Accurate action naming, applicability, composability, and open-world annotations | A13, A18 | undated official pages; retrieved 2026-11-09 | partly | A/S name actions consistently, declare applicability and limitations, preserve composability, and annotate open-world behavior. |
| Paired app/sandbox contract pins and reproducibility snapshots | D5, D7 | undated release pages; retrieved 2026-11-09 | no | A pins application and sandbox contracts together and preserves build snapshots and skill versions. |
| Export intent and draft contamination | D9, D11 | 2026-11-04; 2026-10-26 | no | A exports the intended published version explicitly. |
| Randomized judge order with a reversed-order position-bias check | R1 | 2025-11-11 | partly | A/S randomized arm order; S adds the position-bias check and owns grader calibration for both builders. |

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
- Tool/permission decisions: A2, A13, A18, A20, O2, O4, A23–A25, G2, C2, D14;
  managed checkpoints (O10) apply from skill-builder's enforcement guidance.
  Context and execution: A1, O1, O3. Subagent structure: A21.
  Numerical runtime budgets come from the task/runtime owner, not these sources.
- Render/evaluate: A3, G1, G3, G4, G5, C1, C3, F6, R1; shared evaluation-conduct
  rules, including grader calibration with the position-bias check, apply from
  skill-builder's evaluation contract. Import/shadow/promotion
  and reporting retain those gates, with D5/D7 contract pins and reproducibility
  snapshots; O3 supports typed final/error results. Static validation proves
  structure only.
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
