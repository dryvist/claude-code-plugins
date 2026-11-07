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
inspect actual namespaced builder calls; negative cases use `min: 0`, `max: 0`,
and `arm: both`. Output graders inspect produced artifacts or evidence
decisions. Positive Skill graders are indicators excluded from ablation scores;
check them separately, even if the command exits successfully. Cases cover
authoring, evidence decisions, existing-task execution, and cross-builder
vocabulary collisions. A missing prerequisite may pass a stop-condition rubric,
but counts as **blocked task completion**, never successful artifact creation.
The text-draft case also grades phase-specific prerequisite handling; a
comparison-only resource is not mandatory authoring guidance.

Cases tagged `discrimination` exercise policy decisions: the exact shadow
window, canonical package boundaries, byte/token/safety budgets, and invalid
comparison arms. Run the commands below on the whole development suite for
both snapshots. Inspect per-case WITH/WITHOUT deltas and actual invocation
indicators before asserting that these harder cases discriminate; their
difficulty and contribution are hypotheses until measured. Keep unchanged
development cases as controls, and calibrate judge disagreements from their
artifacts before attributing a score change to the skill. Source: S1 in the
[skill source register](../../skills/skill-builder/references/sources.md).

The native runner creates a fresh home, workspace, and configuration per trial,
with only the target plugin loaded. No personal skills or memory are assumed.
Read-only tools and Skill are listed per case; no operator grants for writes,
shell, network, real servers, or scaffolds are supplied. All inputs are
synthetic and public. Service execution and promotion remain separate gates.

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

An independent evaluator authored `held-out/*/case.yaml` for each builder after
the candidate instruction freeze, without consulting development cases. The
instruction author must not read those prompts, graders, or answers before
acceptance. The lead verifies this separation, freezes the suite revision,
and runs it **once as an acceptance batch**, with repeated clean trials:

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
- Compute precision and recall from **actual Skill invocation** on labeled
  positive and negative trials, each at least 0.9. Report counts per builder,
  per arm, and per suite; do not substitute an overall grader score.
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
Each inline grader declares its type-specific fields directly alongside
`name` and `type`. Held-out prompts, rubrics, expected outcomes, and grader
limits retain their frozen values after this structural conversion.

**Accepted native constraint: shared grader.** The documented schema supports per-case `graders`
entries and per-case `graders/*.md` files. It defines no cross-case grader
reference, include, or suite-level grader defaults. Suite-wide mocks share MCP
responses, not graders. The no-shell, no-write, and no-edit assertions remain
local to each case as an accepted native schema constraint. No custom
preprocessor or undocumented sharing field is introduced.

CLI **2.1.319** exposes no validation-only or dry-run option in
`claude plugin eval --help`. YAML checks and preservation of normalized case
data are structural evidence only. Native suite loading and behavioral
acceptance for this revision remain **not yet run**; the lead runs the commands above outside
the builder sandbox and retains their load errors or measured results.

[native-docs]: https://code.claude.com/docs/en/plugin-evals
[case-fields]: https://code.claude.com/docs/en/plugin-evals#case-yaml-fields
[grader-fields]: https://code.claude.com/docs/en/plugin-evals#grader-frontmatter
