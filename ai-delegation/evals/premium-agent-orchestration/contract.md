# Premium-agent-orchestration evaluation contract

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

| Premium-agent-orchestration development set | Case directories | Measurement |
| --- | --- | --- |
| Positive trigger | `reset-positive` | Actual activation and rule-following output rubric. |
| Negative trigger | `bulk-read-collision` | False activation and output correctness. |
| Execution control | `ladder-control` | Output correctness only; Skill use is optional. |

Cases run text-only against synthetic public state: read-only tools plus Skill.
No shell, writes, network, services, or operator grants. Assertions grade the
SKILL.md rules below, not prose style.

**Rules under test**
(`ai-delegation/skills/premium-agent-orchestration/SKILL.md`):

- On load, run the reset: re-read the goal and success criteria, list every
  in-flight delegate and background job, judge each finished result against
  its named yes/no check, re-plan from live state, fan out ready independent
  tasks in parallel, and answer the user briefly.
- The parent keeps goals, plans, design and risk decisions, authority gates,
  integration and merge choices, and final review; it does not do bulk reads,
  searches, edits, test runs, log digging, or long-output inspection.
- The cheapest-capable ladder is chosen per task, starting at the lowest rung
  that can meet the check. Haiku is the last resort, never the first pick,
  and a premium peer is chosen below the parent's tier, never at it.
- Delegation is strictly downward: judgment that cannot be delegated stays
  with the parent, and reserved decisions (intent, design, security,
  permissions, migrations, data loss, shared state, concurrency, public
  interfaces, user-visible risk) never move to a worker.
- Prices, context price tiers, and windows are read live at call time and
  never hardcoded; tasks split before crossing a context price tier; bulk
  work prefers off-peak windows.
- Every task brief carries one outcome, the exact inputs, and a yes/no check,
  with a static shared prefix first so matching calls can use prefix caching.
- A delegate's output is a claim until its check passes; failures go back
  with the specific shortfall and the next check; nothing unreviewed ships or
  merges.
- Secrets, credentials, private data, and restricted information go only to
  executors approved for them; a public-data-only tier receives public data
  only.
- Failed calls are recorded, then re-planned or re-routed with bounded waits
  and clear stop conditions; no endless polling and no silent absorption of a
  failed task into the parent.

## Held-out cases

`held-out/*/case.yaml` is evaluator-owned; authors must not read or tune
against its prompts, graders, or answers. A case seen during tuning is
development data and must be replaced independently before acceptance.

## Lead commands

```sh
evidence=$(mktemp -d /tmp/premium-agent-orchestration-evidence.XXXXXX)
for suite in native held-out; do
  claude plugin eval ./ai-delegation \
    --eval-dir "evals/premium-agent-orchestration/${suite}" \
    --runs 3 --ablation with-without --threshold 1 --no-publish \
    --model "${EVAL_PREMIUM_ORCHESTRATION_MODEL:?set the permitted evaluation model}" \
    --judge-model "${EVAL_PREMIUM_ORCHESTRATION_JUDGE:?set the permitted judge model}" \
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
