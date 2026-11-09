# Claude-skill-authoring evaluation contract

Status: **candidate not yet run**. Protocol adapted from the estate skill-builder
contract on 2026-11-09. Record the exact reviewed candidate head before running;
earlier measurements do not establish acceptance for this suite.

## Native suites and isolation

Each `native/*/case.yaml` follows Claude Code's documented
[plugin eval format][native-docs] (`schema_version: "1.1"`). The legacy
`evals.json` and `triggers.json` remain skill development inputs; `claude plugin
eval` does not read them and they supply no acceptance results. Natural requests
omit explicit skill invocation. `tool_used: Skill` graders inspect actual calls;
negatives use `min: 0`, `max: 0`, and `arm: both`.

| Authoring development set | Case directories | Measurement |
| --- | --- | --- |
| Positive trigger | `authoring-skill-positive` | Actual activation and rule-following output rubric. |
| Negative trigger | `authoring-agent-collision` | False activation and output correctness. |
| Execution control | `authoring-description-control` | Output correctness only; Skill use is optional. |

Exclude the control from every activation denominator; optional calls on it
are neither true nor false positives. Cases run text-only against synthetic
public state: read-only tools plus Skill. No shell, writes, network, services,
or operator grants. Assertions grade the SKILL.md rules below, not prose style.

**Rules under test**
(`project-standards/skills/claude-skill-authoring/SKILL.md`):

- Scope: authoring or editing a skill in this estate only. General
  skill-authoring guidance stays with Anthropic's own Agent Skills docs;
  platform agent definitions belong to agent-builder; trigger, baseline, and
  held-out evaluation contracts belong to skill-builder.
- File layout: `agentsmd/` is the single source of truth (AGENTS.md entry,
  rules/, skills/, agents/, workflows/). `.copilot/`, `.claude/`, and
  `.gemini/` are vendor directories holding symlinks only, never duplicates;
  canonical content is never duplicated across vendors.
- Description length: CI fails a `SKILL.md` description over **1024 bytes**;
  the soft target is **250 characters** — a trigger phrase plus a one-clause
  purpose. Count bytes, not characters.
- Self-contained rule: a skill must run correctly and safely when it loads
  alone. Token count is a flag, never a reason to break the rule; safety
  reminders stay inline even when duplicated elsewhere; only reference
  material (command catalogs, tables, examples) is deduplicated.

## Held-out cases

`held-out/*/case.yaml` is evaluator-owned; authors must not read or tune
against its prompts, graders, or answers. A case seen during tuning is
development data and must be replaced independently before acceptance.

## Lead commands

```sh
evidence=$(mktemp -d /tmp/authoring-evidence.XXXXXX)
for suite in native held-out; do
  claude plugin eval ./project-standards \
    --eval-dir "evals/claude-skill-authoring/${suite}" \
    --runs 3 --ablation with-without --threshold 1 --no-publish \
    --model "${EVAL_CLAUDE_SKILL_AUTHORING_MODEL:?set the permitted evaluation model}" \
    --judge-model "${EVAL_CLAUDE_SKILL_AUTHORING_JUDGE:?set the permitted judge model}" \
    --output-dir "$evidence/${suite}" \
    --trust-plugin
done
```

Keep one model/harness pair frozen across arms; an update comparison
additionally materializes the previous revision with the same frozen suites
and competing catalog. Keep results local and outside Git.

## Acceptance and reporting

- Every artifact/decision and boundary assertion passes with zero authority
  violations; inspect tool calls and resulting state, not just text.
- Activation precision `TP / (TP + FP)` and recall `TP / (TP + FN)` on the
  labeled trigger set are both at least 0.9 in candidate WITH trials. Exclude
  execution controls from activation denominators.
- No held-out regression against the previous WITH arm. Report latency and
  token/cost measurements with variability; missing measurements stay
  unverified.
- Structural validation, live execution, and promotion have separate
  statuses. Until the lead supplies complete native run artifacts, behavioral
  measurements remain **not yet run**.

## Schema compatibility review

Checked 2026-11-09 against the [case fields][case-fields] and
[grader fields][grader-fields] references of the published plugin-evals
documentation. Inline type-specific fields sit beside `name` and `type`. No
custom preprocessor or cross-case grader include is used.

[native-docs]: https://code.claude.com/docs/en/plugin-evals
[case-fields]: https://code.claude.com/docs/en/plugin-evals#case-yaml-fields
[grader-fields]: https://code.claude.com/docs/en/plugin-evals#grader-frontmatter
