# Replan evaluation contract

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

| Replan development set | Case directories | Measurement |
| --- | --- | --- |
| Positive trigger | `ground-truth-positive` | Actual activation and rule-following output rubric. |
| Negative trigger | `resume-collision` | False activation and output correctness. |
| Execution control | `reconciliation-control` | Output correctness only; Skill use is optional. |

Cases run text-only against synthetic public state: read-only tools plus Skill.
No shell, writes, network, services, or operator grants. Assertions grade the
SKILL.md rules below, not prose style.

**Rules under test**
(`ai-cli-harness-better-practices/skills/replan/SKILL.md`):

- The plan is the least trustworthy source in the room. Replanning re-derives
  ground truth, then rewrites the plan to match; it never edits the plan by
  trusting the plan's own prose or checkboxes.
- Ground truth sources: the artifact itself (read the file, run the test, hit
  the endpoint — it outranks every claim about it); config versus running (a
  config default is not the running system — check the thing itself, not the
  enabling flag); bordered CLI output stripped before diffing; decisions that
  invalidate plan steps; version control, only when inside a work tree, with
  the default branch resolved and used as one shell block and the log
  bounded to recent shipped work.
- An unreachable source is an unknown, never an implicit "nothing there".
- The bulk read (default-branch log, PR listings, checkbox inventory) goes to
  the router via the local-subagents skill at the cheapest capable tier with
  capped input (at most 30 log lines, 30 PRs, and the plan file); reasoning
  happens over the returned table, never the raw dump. An unreachable router
  means doing the step in-house and saying so in the delta — no silent
  fallback.
- Items are classified from live evidence, not the checkbox: done is marked
  complete without carrying forward; invalid is struck with a one-line why;
  valid and open is kept with drifted facts refreshed; newly required gaps
  are added.
- The rewrite is the corrected plan, not a patch over the old prose:
  hard-won context preserved, invalidated instructions cut, every PR/issue a
  full URL, every file an absolute path, reversals stated plainly, and
  shipped work recorded so no one redoes it.
- The delta is confirmed in the Replanned format: marked done, struck, still
  open, newly added.
- In plan mode, only the plan file is edited, exiting through the normal
  plan-approval path.

## Held-out cases

`held-out/*/case.yaml` is evaluator-owned; authors must not read or tune
against its prompts, graders, or answers. A case seen during tuning is
development data and must be replaced independently before acceptance.

## Lead commands

```sh
evidence=$(mktemp -d /tmp/replan-evidence.XXXXXX)
for suite in native held-out; do
  claude plugin eval ./ai-cli-harness-better-practices \
    --eval-dir "evals/replan/${suite}" \
    --runs 3 --ablation with-without --threshold 1 --no-publish \
    --model "${EVAL_REPLAN_MODEL:?set the permitted evaluation model}" \
    --judge-model "${EVAL_REPLAN_JUDGE:?set the permitted judge model}" \
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
