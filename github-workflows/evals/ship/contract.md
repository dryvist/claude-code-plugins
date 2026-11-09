# Ship evaluation contract

Status: **candidate not yet run**. Protocol adapted from the estate skill-builder
contract on 2026-11-09. Record the exact reviewed candidate head before running;
earlier measurements do not establish acceptance for this suite.

## Native suites and isolation

Each `native/*/case.yaml` follows Claude Code's documented
[plugin eval format][native-docs] (`schema_version: "1.1"`). The legacy `evals.json` remains a skill development
input; `claude plugin eval` does not read it and it supplies no acceptance
results. Natural requests omit explicit skill invocation. `tool_used: Skill`
graders inspect actual calls; negatives use `min: 0`, `max: 0`, and `arm: both`.

| Ship development set | Case directories | Measurement |
| --- | --- | --- |
| Positive trigger | `pipeline-positive` | Actual activation and rule-following output rubric. |
| Negative trigger | `merge-collision` | False activation and output correctness. |
| Execution control | `gate-decision` | Output correctness only; Skill use is optional. |

Cases run text-only against synthetic public state: read-only tools plus Skill.
No shell, writes, network, services, or operator grants. Assertions grade the
SKILL.md rules below, not prose style.

**Rules under test** (`github-workflows/skills/ship/SKILL.md`):

- Step 0 stops on a failed working-directory check with no recovery.
- Claim check before PR creation; earliest claim wins, no duplicates.
- Git Town branch naming on the default branch; selective staging; conventional
  commit; local validation before push.
- PRs finalize sequentially via /finalize-pr; /resolve-pr-threads is never run
  separately; agents never arm auto-merge.
- Before any "Ready to merge": live Gate 1 (`mergeStateStatus` `CLEAN` or
  `HAS_HOOKS`) and Gate 2 (code-scanning alert count `0`, separate from CI);
  missing required contexts report `required check never reported`.
- On a Git Flow repo, develop-to-main promotion is routed to /promote-release
  as a mandatory checklist item.
- Never assume a PR merged; re-run everything from Step 0 on every invocation.

## Held-out cases

`held-out/*/case.yaml` is evaluator-owned; authors must not read or tune against
its prompts, graders, or answers. A case seen during tuning is development data
and must be replaced independently before acceptance.

## Lead commands

```sh
evidence=$(mktemp -d /tmp/ship-evidence.XXXXXX)
for suite in native held-out; do
  claude plugin eval ./github-workflows \
    --eval-dir "evals/ship/${suite}" \
    --runs 3 --ablation with-without --threshold 1 --no-publish \
    --model "${EVAL_SHIP_MODEL:?set the permitted evaluation model}" \
    --judge-model "${EVAL_SHIP_JUDGE:?set the permitted judge model}" \
    --output-dir "$evidence/${suite}" \
    --trust-plugin
done
```

Keep one model/harness pair frozen across arms; an update comparison additionally
materializes the previous revision with the same frozen suites and competing
catalog. Keep results local and outside Git.

## Acceptance and reporting

- Every artifact/decision and boundary assertion passes with zero authority
  violations; inspect tool calls and resulting state, not just text.
- Activation precision `TP / (TP + FP)` and recall `TP / (TP + FN)` on the
  labeled trigger set are both at least 0.9 in candidate WITH trials. Exclude
  execution controls from activation denominators.
- No held-out regression against the previous WITH arm. Report latency and
  token/cost measurements with variability; missing measurements stay unverified.
- Structural validation, live execution, and promotion have separate statuses.
  Until the lead supplies complete native run artifacts, behavioral measurements
  remain **not yet run**.

## Schema compatibility review

Checked 2026-11-09 against the [case fields][case-fields] and
[grader fields][grader-fields] references of the published plugin-evals
documentation. Inline type-specific fields sit beside
`name` and `type`. No custom preprocessor or cross-case grader include is used.

[native-docs]: https://code.claude.com/docs/en/plugin-evals
[case-fields]: https://code.claude.com/docs/en/plugin-evals#case-yaml-fields
[grader-fields]: https://code.claude.com/docs/en/plugin-evals#grader-frontmatter
