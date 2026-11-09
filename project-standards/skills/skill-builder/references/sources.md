# Skill authoring sources

Research cutoff: **2026-11-06**; provenance clarified **2026-11-07**.
Each record separates publication/revision from retrieval. Existing retrieval
dates are retained; S4, S5, and A3 were rechecked on **2026-11-07**. Undated pages do not
establish recency; material over 12 months old is background only.
No practitioner source is required for this refresh.
Reverified **2026-11-09**: S1–S5, E1, and the shared A1–A3/O1–O3 records
match their registered dates and pinned revisions, and no current source
contradicts the applied rules; the entries below record what the recheck
added.

## Skill-specific register

| ID | Source | Published or revised | Retrieved | Applied guidance |
| --- | --- | --- | --- | --- |
| S1 | Anthropic [skill-creator](https://github.com/anthropics/skills/blob/b0cbd3df1533b396d281a6886d5132f623393a9c/skills/skill-creator/SKILL.md) | Revised [2026-03-06](https://github.com/anthropics/skills/commit/b0cbd3df1533b396d281a6886d5132f623393a9c) | 2026-11-06 | Previous-version/no-skill baseline, observable artifacts, independent trigger testing, repeated experiments. Outside the preferred 4-month window; within 12 months. |
| S2 | OpenAI [Build skills](https://learn.chatgpt.com/docs/build-skills) | Unavailable (undated) | 2026-11-06; rechecked 2026-11-09 | Supplementary native invocation/dependency metadata, focused descriptions, instruction-first packaging. The live page (canonical [Agent Skills](https://developers.openai.com/codex/skills)) documents `agents/openai.yaml` interface metadata with `policy.allow_implicit_invocation` and `dependencies.tools`, a skill-list budget of about 2% of the context window (8,000 characters) with descriptions shortened first, and front-loading trigger words. |
| S3 | Anthropic [Extend Claude with skills](https://code.claude.com/docs/en/skills) | Unavailable (undated); page updated 2026-11-04 | 2026-11-06; rechecked 2026-11-09 | Supplementary Claude invocation lifecycle, supporting files, and tool pre-approval semantics. The recheck documents the optional `when_to_use` trigger field, a 1,536-character combined `description` plus `when_to_use` cap in the skill listing, `disable-model-invocation`, and compaction that retains only each skill's first 5,000 tokens within a shared 25,000-token budget. |
| S4 | Anthropic [Test plugins with evals](https://code.claude.com/docs/en/plugin-evals) | Unavailable (undated) | 2026-11-07 | Native case format, output-only controls, actual Skill-call indicators separate from task scores, clean trials, baseline arms, and local reports. CLI help previously verified at 2.1.319 on 2026-11-06. |
| S5 | Google [Gemini CLI skill precedence](https://geminicli.com/docs/cli/skills/#precedence-and-aliases) | Updated 2026-04-30 | 2026-11-07 | Same-name scope and alias precedence; selected resource path and revision verification. Outside the preferred 4-month window; within 12 months. |
| E1 | Local [claude-skill-authoring](../../claude-skill-authoring/SKILL.md) | Revised [2026-11-06](https://github.com/dryvist/claude-code-plugins/commit/6790c0dde3767577f543ed7cad9e3bd2af92294c) | 2026-11-06 | 1,024-byte description maximum, approximately 250-character target, canonical placement, self-contained execution, inline safety. |
| S6 | Anthropic Agent Skills [overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) and [best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | Unavailable (undated current documentation) | 2026-11-09 | Specification limits: name up to 64 characters lowercase/hyphenated, description up to 1,024 characters non-empty; SKILL.md body under 500 lines; references one level deep with a table of contents in files over 100 lines; avoid time-sensitive wording. |

## Shared dated sources

Use the single [shared register and findings table](../../agent-builder/references/sources.md)
for A1–A3, O1–O3, G1–G2, and E2, including their URLs, publication/revision dates,
retrieval dates, and pre-refresh coverage. Each ID has one canonical record rather than copied
tables across the builders. Both directories ship in the same plugin.

| Skill-builder rule group | Dated support |
| --- | --- |
| Scope, reuse, minimal instructions, description triggers/exclusions | O1 (2026-09-11), A1 (2026-07-24). |
| Runtime permissions, untrusted inputs, pre-action controls | A2 (2026-10-08), O2 (2026-10-13), G2 (2026-09-22). |
| Frozen thresholds, clean baseline arms, held-out ownership, uncertainty | A3 (2026-09-28), S1 (2026-03-06). |
| General fixes from development failures and attributable optimization rounds | A3 (2026-09-28), live publication date confirmed 2026-11-07. |
| Trigger separation and observable tool/result grading | S1 (2026-03-06), G1 (2026-10-16). |
| Context accounting, disclosure, compaction and execution limits | A1 (2026-07-24), O3 (2026-09-30), E1 (2026-11-06). |
| Portable packaging and invocation policy | O1 (2026-09-11), E1 (2026-11-06); S2/S3 supplement harness syntax. |
| Structural checks, regression gates, outputs and future refresh | A3 (2026-09-28), G1 (2026-10-16), O3 (2026-09-30); local CI owns commands. |

## Retained policy and conflict resolutions

- E1's byte budget is stricter than the public 1,024-character skill format.
  Check UTF-8 bytes independently; the units are not interchangeable.
- The operator-required installed estate authoring standard, version 5.10.0,
  supplies the on-demand token budget applied on 2026-11-06. Its publication
  date is unavailable; retrieved 2026-11-06 and consulted again 2026-11-07.
  The current E1 file does not contain those numbers.
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
  writing-for-agents. Installed copies were consulted on 2026-11-07; their
  publication/revision dates are unavailable from the cache metadata.
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
