# Goal evaluation contract

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

| Goal development set | Case directories | Measurement |
| --- | --- | --- |
| Positive trigger | `statement-positive` | Actual activation and rule-following output rubric. |
| Negative trigger | `progress-collision` | False activation and output correctness. |
| Execution control | `cap-cut-control` | Output correctness only; Skill use is optional. |

Cases run text-only against synthetic public state: read-only tools plus Skill.
No shell, writes, network, services, or operator grants. Assertions grade the
SKILL.md rules below, not prose style.

**Rules under test**
(`ai-cli-harness-better-practices/skills/goal/SKILL.md`):

- One artifact: a single goal statement body printed to the user, then stop.
  No file writes, commits, git or gh calls, network access, plan edits, or
  task updates.
- Focus: a supplied argument is the focus, honored as a compact-style hint
  with exclusions taken literally. Without one, derive from the most recent
  pivot, then unfinished plan items, then open tasks; absent sources are
  skipped; the conversation wins over the plan file.
- Structure: an objective plus an explicit boundary, then numbered success
  criteria in dependency order, each a verifiable yes/no condition led by a
  bolded noun phrase; the last criterion is end-to-end verification naming
  what gets run and what output proves it; close with one persistence line.
- Rules: end conditions, never steps; self-contained wording; absolute paths
  and full URLs; no secret values, hostnames, or IPs — name where the value
  lives; harness-neutral wording; never a blockquote; the body never contains
  a heading.
- The 4000-character cap is measured, never estimated, with
  `LC_ALL=en_US.UTF-8 wc -m` piped from a heredoc — the only command this
  skill runs; `-m` not `-c`; the UTF-8 locale prefix is load-bearing.
- Over the cap, cut prose inside criteria first, then the objective's second
  sentence, then background; re-measure after each cut; never drop a
  criterion the work needs; if it still will not fit, print it anyway with
  the measured count and the criterion at risk.
- Output: direct invocation wraps the body in `## Goal statement (<N> chars)`;
  skill callers get only the body preceded by `chars: <N>`; nothing else is
  printed except the two allowed one-line notes (a missing source changed the
  result; over cap, the criterion at risk).

## Held-out cases

`held-out/*/case.yaml` is evaluator-owned; authors must not read or tune
against its prompts, graders, or answers. A case seen during tuning is
development data and must be replaced independently before acceptance.

## Lead commands

```sh
evidence=$(mktemp -d /tmp/goal-evidence.XXXXXX)
for suite in native held-out; do
  claude plugin eval ./ai-cli-harness-better-practices \
    --eval-dir "evals/goal/${suite}" \
    --runs 3 --ablation with-without --threshold 1 --no-publish \
    --model "${EVAL_GOAL_MODEL:?set the permitted evaluation model}" \
    --judge-model "${EVAL_GOAL_JUDGE:?set the permitted judge model}" \
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
