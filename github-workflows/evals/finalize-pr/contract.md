# Finalize-pr evaluation contract

Status: **candidate not yet run**. Protocol adapted from the estate skill-builder
contract on 2026-11-09. Record the exact reviewed candidate head before running;
earlier measurements do not establish acceptance for this suite.

## Native suites and isolation

Each `native/*/case.yaml` follows Claude Code's documented
[plugin eval format][native-docs] (`schema_version: "1.1"`). The legacy `evals.json` remains a skill development
input; `claude plugin eval` does not read it and it supplies no acceptance
results. Natural requests omit explicit skill invocation. `tool_used: Skill`
graders inspect actual calls; negatives use `min: 0`, `max: 0`, and `arm: both`.

| Finalize-pr development set | Case directories | Measurement |
| --- | --- | --- |
| Positive trigger | `fix-loop-positive` | Actual activation and rule-following output rubric. |
| Negative trigger | `merge-collision` | False activation and output correctness. |
| Execution control | `readiness-gate` | Output correctness only; Skill use is optional. |

Cases run text-only against synthetic public state: read-only tools plus Skill.
No shell, writes, network, services, or operator grants. Assertions grade the
SKILL.md rules below, not prose style.

**Rules under test** (`github-workflows/skills/finalize-pr/SKILL.md`):

- Done means CI green, CodeQL clean, all feedback answered, no conflicts,
  simplified, metadata current — by acting on blockers, never reporting them.
- Phase 3 runs live on every invocation with no short-circuit; subagent
  self-reports and earlier in-session results are stale snapshots.
- `mergeable` MERGEABLE is git-conflict-free only; `mergeStateStatus` must be
  `CLEAN` or `HAS_HOOKS`, `BEHIND` is fixed via the Git Town rule.
- CodeQL is separate from CI; the canonical alert count must be `0`.
- /simplify runs once at Step 2.3.5 after fixes; pre-push simplification is
  /ship's job. Bots are never filtered; org mode never crosses the org
  boundary; metadata regeneration is delegated (title under 70 chars,
  Summary/Changes/Test Plan, Zammad reference carried forward verbatim).
- On a Git Flow repo the post-merge develop-to-main promotion via
  /promote-release is added to the session checklist as mandatory.

## Held-out cases

`held-out/*/case.yaml` is evaluator-owned; authors must not read or tune against
its prompts, graders, or answers. A case seen during tuning is development data
and must be replaced independently before acceptance.

## Lead commands

```sh
evidence=$(mktemp -d /tmp/finalize-pr-evidence.XXXXXX)
for suite in native held-out; do
  claude plugin eval ./github-workflows \
    --eval-dir "evals/finalize-pr/${suite}" \
    --runs 3 --ablation with-without --threshold 1 --no-publish \
    --model "${EVAL_FINALIZE_PR_MODEL:?set the permitted evaluation model}" \
    --judge-model "${EVAL_FINALIZE_PR_JUDGE:?set the permitted judge model}" \
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
