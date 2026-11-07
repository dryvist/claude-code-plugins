# Skill authoring sources

Research cutoff and retrieval date: **2026-11-06**. Publication/update dates
are distinguished from retrieval. Undated pages do not establish recency;
material over 12 months old is background only. No practitioner source is
required for this refresh.

## Skill-specific register

| ID | Source | Published or updated | Applied guidance |
| --- | --- | --- | --- |
| S1 | Anthropic [skill-creator](https://github.com/anthropics/skills/blob/b0cbd3df1533b396d281a6886d5132f623393a9c/skills/skill-creator/SKILL.md) | Updated [2026-03-06](https://github.com/anthropics/skills/commit/b0cbd3df1533b396d281a6886d5132f623393a9c) | Previous-version/no-skill baseline, observable artifacts, independent trigger testing, repeated experiments. Outside the preferred 4-month window; within 12 months. |
| S2 | OpenAI [Build skills](https://learn.chatgpt.com/docs/build-skills) | Undated; verified 2026-11-06 | Supplementary native invocation/dependency metadata, focused descriptions, instruction-first packaging. |
| S3 | Anthropic [Extend Claude with skills](https://code.claude.com/docs/en/skills) | Undated; verified 2026-11-06 | Supplementary Claude invocation lifecycle, supporting files, and tool pre-approval semantics. |
| S4 | Anthropic [Test plugins with evals](https://code.claude.com/docs/en/plugin-evals) | Publication/update date unavailable; retrieved 2026-11-06. CLI help verified at 2.1.319. | Native case format, actual Skill-call graders, clean repeated trials, baseline arms, and local reports. Undated supplementary syntax guidance. |
| E1 | Local [claude-skill-authoring](../../claude-skill-authoring/SKILL.md) | Updated [2026-11-06](https://github.com/dryvist/claude-code-plugins/commit/6790c0dde3767577f543ed7cad9e3bd2af92294c) | 1,024-byte description maximum, approximately 250-character target, canonical placement, self-contained execution, inline safety. |

## Shared dated sources

Use the single [shared register and findings table](../../agent-builder/references/sources.md)
for A1–A3, O1–O3, G1–G2, and E2, including their URLs, publication/update dates,
and pre-refresh coverage. Each ID has one canonical record rather than copied
tables across the builders. Both directories ship in the same plugin.

| Skill-builder rule group | Dated support |
| --- | --- |
| Scope, reuse, minimal instructions, description triggers/exclusions | O1 (2026-09-11), A1 (2026-07-24). |
| Runtime permissions, untrusted inputs, pre-action controls | A2 (2026-10-08), O2 (2026-10-13), G2 (2026-09-22). |
| Frozen thresholds, clean baseline arms, held-out ownership, uncertainty | A3 (2026-09-28), S1 (2026-03-06). |
| Trigger separation and observable tool/result grading | S1 (2026-03-06), G1 (2026-10-16). |
| Context accounting, disclosure, compaction and execution limits | A1 (2026-07-24), O3 (2026-09-30), E1 (2026-11-06). |
| Portable packaging and invocation policy | O1 (2026-09-11), E1 (2026-11-06); S2/S3 supplement harness syntax. |
| Structural checks, regression gates, outputs and future refresh | A3 (2026-09-28), G1 (2026-10-16), O3 (2026-09-30); local CI owns commands. |

## Retained policy and conflict resolutions

- E1's byte budget is stricter than the public 1,024-character skill format.
  Check UTF-8 bytes independently; the units are not interchangeable.
- The operator-required installed estate authoring standard, version 5.10.0,
  supplies the on-demand token budget applied on 2026-11-06. Its publication
  date is unavailable; the current E1 file does not contain those numbers.
  The entrypoint keeps that binding budget inline; CI separately checks lines.
  Local policy is not attributed to an upstream vendor or a conversion formula.
- Keep essential safety inline even when another file repeats it. Upstream
  concision guidance does not override E1's self-contained rule.
- Preserve existing automatic discovery. Make explicit-only invocation an
  operator decision; S3's workflow examples do not grant permission to change
  invocation policy or perform privileged actions.
- The estate's instruction/native-tool rule excludes introducing a custom
  script or evaluation framework here. Upstream executable-resource examples
  are optional patterns, not a requirement to add them.
- The existing platform home, plugin packaging, and repository checks remain
  local requirements (E2). Required authoring references include Anthropic
  skill-creator, plugin-dev's agent/skill/command/hook-development, and
  writing-for-agents. Their installed guidance was read for this refresh;
  a cache label such as `unknown` does not establish an upstream version.

## Evaluation evidence boundary

The draft/evidence-review/experiment branches apply S1's staged authoring
workflow (updated 2026-03-06) and E1's self-contained execution rule. Mandatory
authoring guides remain prerequisites. Comparison resources load for an
experiment; source registers load for provenance. S4's isolation reference
(undated; rechecked 2026-11-07) confirms eval directories are hidden from the
candidate and personal skills are absent. A draft can be delivered before
behavioral acceptance, with unrun checks identified separately.

[Native development cases](../../../evals/skill-builder/native/) specify observable expectations, with
baseline revision and acceptance criteria in [the eval contract](../../../evals/skill-builder/contract.md).
Trigger selection, actual task execution, schema/lint validation, and deployed
performance are different measurements. A review of instructions or a hand-run
case does not establish target-harness trigger precision or a held-out result.
Refresh on changed source guidance, models, tools, or harnesses; freeze unseen
cases with the evaluator before any optimization.

## Evidence and packaging review trace

Review guidance checked **2026-11-07**. S4's undated native reference was
rechecked on that date: positive Skill-call checks are unscored indicators
in two-arm runs, and equal task scores measure no task contribution on those
cases. Those semantics stay inline for evidence decisions; the experiment
contract is not required to interpret a supplied result. A3 (2026-09-28) and
S1 (2026-03-06) support preserving measured observations while rejecting
contaminated comparisons and requesting clean repetitions.

Packaging reviews apply E1's byte maximum, the separately retained installed
token budget, and inline safety exception. The native packaging prompt permits
installed policy reads while excluding network lookups; neither authority nor
the rubric's limits change. Descriptions include packaging/context-budget and
comparison reviews, while excluding platform-agent work and skill execution.
The new native comparison-control case separates correct activation, unchanged
task quality, and a measured efficiency regression. Existing ceiling-score
cases remain controls. Discrimination and trigger recall remain unmeasured
until the lead runs the revised suites.

Description routing clarified **2026-11-07** using S1's trigger guidance and
O1's focused descriptions, within E1's byte budget. Skill-builder names
creation/design, trigger tuning, eval execution or interpretation, version
comparison, acceptance, and packaging/budget reviews. Claude-skill-authoring
identifies estate SKILL.md constraints and routes the builder workflow to
skill-builder. Platform-agent work stays outside skill-builder's trigger scope.
This changes discovery metadata; native activation remains unmeasured here.
