# Builder evaluation contract

Status: **revised candidate not yet run**. Protocol updated **2026-11-07**.
Previous-version baseline: `2e9447d7a2a95a2ed806727da7505c676b25f021`.
Record the exact reviewed candidate and development-suite heads before running;
earlier candidate measurements do not establish acceptance for this revision.

## Native suites and isolation

Run Claude Code's documented [plugin eval format][native-docs], checked against
CLI **2.1.319** on 2026-11-06. Each `native/*/case.yaml` has `schema_version:
"1.1"`, a name, `execution.prompt`, allowed tools, and native graders. The
legacy `evals.json` and `triggers.json` remain skill-creator development inputs;
`claude plugin eval` does not read them, and they supply no acceptance results.

Natural requests omit explicit builder invocation. `tool_used: Skill` graders
inspect actual calls; negatives use `min: 0`, `max: 0`, and `arm: both`.
Positive Skill indicators are excluded from native ablation scores; inspect
them independently of output correctness, even when the command succeeds.

| Skill-builder development set | Case directories | Measurement |
| --- | --- | --- |
| Positive triggers | `create-skill`, `packaging-budget`, `contaminated-comparison`, `policy-evidence-review`, `policy-comparison-review` | Actual activation and independent output rubrics. |
| Negative triggers | `existing-extraction`, `agent-collision` | False activation and output correctness. |
| Execution controls | `evidence-decision`, `comparison-control` | Output correctness only; Skill use is optional. |

Exclude controls from every activation denominator; optional calls on controls
are neither true nor false positives. Retain their inputs and correctness
rubrics. The comparison control's fixture comes from revision `a04d17a5`.
Policy-review companions permit installed-policy reads with public inline
fixtures, but forbid eval execution, writes, and services. Cases tagged
`discrimination` test specialized policy; contribution remains unmeasured
until repeated baseline comparisons. Calibrate judge disagreements from
artifacts. Source: S1 in the [source register](../../skills/skill-builder/references/sources.md).
A prerequisite stop is blocked completion, even if its rubric passes; text
drafts do not require comparison-only resources.

The native runner creates a fresh home, workspace, and configuration per trial,
with only the target plugin loaded. No personal skills or memory are assumed.
Read-only tools and Skill are listed per case; no operator grants for writes,
shell, network, real servers, or scaffolds are supplied. All inputs are
synthetic and public. Service execution and promotion remain separate gates.

**Target coverage:** Haiku 5.5 with Claude Code **2.1.319** and the isolated
plugin catalog is one recorded regression target, not evidence for all models
or harnesses. Before acceptance, the lead freezes every permitted production
model/harness pair, including Codex where used, and records exact versions,
effective skill catalogs, visibility/truncation diagnostics, and native
selection evidence. Report each pair separately; Claude Skill calls do not
establish Codex activation. Missing target runs remain unverified.

## Lead commands: development and baselines

From the reviewed repository root, set `EVAL_BUILDER_MODEL` and
`EVAL_BUILDER_JUDGE` to permitted, live-verified model identifiers. Preserve the
same identifiers, provider, effort, tools, grader versions, and CLI version
across all arms. These commands run 3 fresh trials per case per arm, retain
reports outside the checkout, and keep publishing disabled:

```sh
builder_evidence=$(mktemp -d /private/tmp/builder-evidence.XXXXXX)
for builder in agent-builder skill-builder; do
  claude plugin eval ./project-standards \
    --eval-dir "evals/$builder/native" \
    --runs 3 --ablation with-without --threshold 1 --no-publish \
    --model "${EVAL_BUILDER_MODEL:?set the permitted evaluation model}" \
    --judge-model "${EVAL_BUILDER_JUDGE:?set the permitted judge model}" \
    --output-dir "$builder_evidence/candidate-$builder" \
    --trust-plugin
done
```

The default without-plugin arm measures contribution over no plugin. An update
also needs the previous-version comparison, with the same competing catalog.
Materialize that Git snapshot with native tools, distribute the **same frozen
suites** into its plugin, and run the same cases against it:

```sh
builder_baseline=$(mktemp -d /private/tmp/builder-baseline.XXXXXX)
git archive 2e9447d7a2a95a2ed806727da7505c676b25f021 project-standards |
  tar -x -C "$builder_baseline"
for builder in agent-builder skill-builder; do
  mkdir -p "$builder_baseline/project-standards/evals/$builder"
  cp -R "project-standards/evals/$builder/." \
    "$builder_baseline/project-standards/evals/$builder/"
  claude plugin eval "$builder_baseline/project-standards" \
    --eval-dir "evals/$builder/native" \
    --runs 3 --ablation with-without --threshold 1 --no-publish \
    --model "${EVAL_BUILDER_MODEL:?set the permitted evaluation model}" \
    --judge-model "${EVAL_BUILDER_JUDGE:?set the permitted judge model}" \
    --output-dir "$builder_evidence/previous-$builder" \
    --trust-plugin
done
```

Retain each `aggregate-result.json` and HTML report. Compare candidate WITH
against previous WITH, and inspect the no-plugin deltas separately. Both
snapshots must expose the same competing catalog; a catalog difference
invalidates the update comparison. Keep results local and outside Git.

## Independent held-out cases

The independent evaluator owns `held-out/*/case.yaml`. Authors must not read
its prompts, graders, or answers. The lead verifies independence from tuning,
freezes the suite revision, and runs **one acceptance batch** with clean trials:

```sh
for builder in agent-builder skill-builder; do
  claude plugin eval ./project-standards \
    --eval-dir "evals/$builder/held-out" \
    --runs 3 --ablation with-without --threshold 1 --no-publish \
    --model "${EVAL_BUILDER_MODEL:?set the permitted evaluation model}" \
    --judge-model "${EVAL_BUILDER_JUDGE:?set the permitted judge model}" \
    --output-dir "$builder_evidence/held-out-candidate-$builder" \
    --trust-plugin
  claude plugin eval "$builder_baseline/project-standards" \
    --eval-dir "evals/$builder/held-out" \
    --runs 3 --ablation with-without --threshold 1 --no-publish \
    --model "${EVAL_BUILDER_MODEL:?set the permitted evaluation model}" \
    --judge-model "${EVAL_BUILDER_JUDGE:?set the permitted judge model}" \
    --output-dir "$builder_evidence/held-out-previous-$builder" \
    --trust-plugin
done
```

The evaluator returns aggregate acceptance and boundary outcomes, withholding
prompts and answers from the author. If the author sees or tunes against a
case, it becomes development data; replace it independently before acceptance.
If instruction behavior changes after freezing, obtain a fresh held-out set.

## Acceptance and reporting

- Require every artifact/decision and boundary assertion to pass, with zero
  authority violations. Inspect tool calls and resulting state, not just text.
- Compute activation precision `TP / (TP + FP)` and recall `TP / (TP + FN)`
  on the labeled trigger set only; both must be **at least 0.9** in candidate
  WITH trials. TP/FN count positive requests with/without actual selection;
  FP/TN count negative requests with/without it. Report counts by builder,
  target, arm, and suite. Undefined denominators cannot pass. No-plugin arms
  are baselines, not positive-recall gates. Report task correctness separately
  for triggers and controls; neither task scores nor activation prove the other.
- Require no held-out regression against previous WITH. Compare run-level
  task scores, latency, and exposed token/cost measurements; report variability
  and missing measurements. No improvement claim is justified within noise.
- Record candidate/baseline/suite revisions, CLI/model/effort/provider/grader
  settings, case/arm/trial IDs, invocation results, artifacts, and verdicts.
  Separate infrastructure errors, truncation, and judge disagreement from
  skill failures. Partial runs and skipped paid graders cannot pass acceptance.
- Structural validation, these authoring/evidence-review tasks, live platform
  execution, and promotion have separate statuses. The old planning smoke
  observations are not acceptance. Until the lead supplies complete native
  run artifacts for this revision, its behavioral measurements remain **not yet run**.

## Schema compatibility review

Checked **2026-11-06** against the [case fields][case-fields] and
[grader fields][grader-fields] references (publication/update date unavailable).
Rechecked **2026-11-07**: output graders alone are valid; controls require no
Skill-call grader. Inline type-specific fields sit beside `name` and `type`.
The native schema has no cross-case grader include or shared defaults, so
activation indicators remain local. No custom preprocessor is introduced.
Held-out files remain untouched.

CLI **2.1.319** has no validation-only/dry-run option for `claude plugin eval`.
YAML validation proves structure only. Native loading and behavioral
acceptance remain **not yet run**; the lead retains results or load errors.

Authoring standards: estate agent-builder, skill-builder, claude-skill-authoring,
and agent-standards; Anthropic skill-creator; plugin-dev agent-, skill-, command-,
and hook-development; writing-for-agents; R2 section 2 a–g.

[native-docs]: https://code.claude.com/docs/en/plugin-evals
[case-fields]: https://code.claude.com/docs/en/plugin-evals#case-yaml-fields
[grader-fields]: https://code.claude.com/docs/en/plugin-evals#grader-frontmatter
