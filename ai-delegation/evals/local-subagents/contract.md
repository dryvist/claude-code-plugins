# Local-subagents evaluation contract

Status: **candidate not yet run**. Protocol adapted from the estate skill-builder
contract on 2026-11-09. Record the exact reviewed candidate head before running;
earlier measurements do not establish acceptance for this suite.

## Native suites and isolation

Each `native/*/case.yaml` follows Claude Code's documented
[plugin eval format][native-docs] (`schema_version: "1.1"`). The legacy
`evals.json` remains a skill development input; `claude plugin eval` does not
read it and it supplies no acceptance results. Natural requests omit explicit
skill invocation. `tool_used: Skill` graders inspect actual calls; negatives
use `min: 0`, `max: 0`, and `arm: both`.

| Local-subagents development set | Case directories | Measurement |
| --- | --- | --- |
| Positive trigger | `delegation-positive` | Actual activation and rule-following output rubric. |
| Negative trigger | `spend-collision` | False activation and output correctness. |
| Execution control | `placement-control` | Output correctness only; Skill use is optional. |

Cases run text-only against synthetic public state: read-only tools plus Skill.
No shell, writes, network, services, or operator grants. Assertions grade the
SKILL.md rules below, not prose style.

**Rules under test** (`ai-delegation/skills/local-subagents/SKILL.md`):

- Delegate only checkable work: summaries, classification, extraction,
  first-pass code reading, boilerplate drafts, output reduction. Judgment,
  design, risk, and security review stay put, and code edits never go to a
  router tier; they go to Codex or a scoped worker subagent.
- Split the job; never escalate the whole job. The cheapest capable tier
  judges the subtask, not the parent task. With a verification command, the
  cheapest tier runs first, only failures re-run one tier up, escalation
  stops after one step, and a still-failing item comes back.
- Never delegated at any tier: secrets and credentials, secret-store context,
  private infrastructure topology, personal data, and anything a free-tier
  caveat forbids.
- The endpoint arrives from environment variables, never assumptions. No
  endpoint variable means the work happens without the router, stated as a
  choice. A missing router is never solved by hunting for a provider key.
- The live menu is fetched before choosing; model names are never hardcoded.
  Prefer capability names, match `best_for` to the subtask, take free before
  paid then fastest, check the context window against the input, read the
  caveats, and escalate one quality class at a time after a checked shortfall.
- Every call carries a timeout sized from the `speed` class; send only what
  the subtask needs; prompts are short imperatives with an explicit output
  schema, a row cap, and a hard STOP; fan-out stays at two or three in
  flight.
- Refusals are reported, never absorbed silently: no `401`/`403` retry with a
  different credential, a menu re-fetch on an unknown model, a smaller slice
  on a context-length refusal, and never a provider credential as the fix.
- Each delegated result is reported with the alias that produced it, plus a
  statement whenever the choice was made without hints, the id-only listing
  was used, or the work came back in-house; for silent redirect roles, name
  what the response says actually answered.

## Held-out cases

`held-out/*/case.yaml` is evaluator-owned; authors must not read or tune
against its prompts, graders, or answers. A case seen during tuning is
development data and must be replaced independently before acceptance.

## Lead commands

```sh
evidence=$(mktemp -d /tmp/local-subagents-evidence.XXXXXX)
for suite in native held-out; do
  claude plugin eval ./ai-delegation \
    --eval-dir "evals/local-subagents/${suite}" \
    --runs 3 --ablation with-without --threshold 1 --no-publish \
    --model "${EVAL_LOCAL_SUBAGENTS_MODEL:?set the permitted evaluation model}" \
    --judge-model "${EVAL_LOCAL_SUBAGENTS_JUDGE:?set the permitted judge model}" \
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
