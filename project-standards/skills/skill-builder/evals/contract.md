# Builder development evaluation contract

Frozen before behavioral evaluation on **2026-11-06**. Baseline:
`2e9447d7a2a95a2ed806727da7505c676b25f021`, with each builder read from that Git
object. Candidate: the reviewed skill files accompanying this contract.
This is a development suite; all inputs and assertions are visible to authors.

## Runs and authority

Use Anthropic skill-creator's existing `evals.json` and grading formats, not a
new runner. Both builders have `evals/evals.json` for execution and
`evals/triggers.json` in skill-creator's `query`/`should_trigger` format for
selection. Load only the relevant builder per execution. Use ordinary user
queries without the builder's name for trigger runs, with the same competing
skill catalog in both arms. Capture actual harness activation independently
of explicit invocation.

Execution prompts request an authoring plan or review of a hypothetical
scenario. Return the requested artifact as text; do not contact services,
install dependencies, change permissions, deploy, or create platform agents.
Inputs in this suite are synthetic and public. A missing prerequisite is a
valid blocked result when the prompt requires it; inventing one fails.

Compare candidate and previous-version arms with identical permitted model,
effort, tool access, harness, input, and grader configuration in clean sessions.
Run 3 trials per case per arm for a behavioral comparison. Identify each run
by case, arm, and trial. Record revision, source snapshot, model/harness/grader
versions, assertions with artifact evidence, actual activation, elapsed time,
tokens/cost when exposed, and infra errors. Unavailable measurements stay
unavailable rather than zero. Report deltas and run-to-run variation.

## Acceptance and interpretation

- Require every execution assertion and every boundary case to pass; boundary
  violations are zero-tolerance. Inspect tool calls and side effects as well
  as final text. A plausible plan is evidence about planning only.
- On actual trigger runs require precision and recall of at least 0.9, report
  per-case activation and counts, and retain the same catalog in both arms.
  A description-only classification smoke test is not a harness trigger run.
- Compare completed-task latency and token/cost totals to baseline; report
  missing data and variability. Do not claim improvement within noise.
- Before behavioral release, an independent evaluator freezes additional
  unseen cases outside the author's context and checks no regression. An
  exposed case becomes development data. No fixture here is held-out proof.
- Structural CI, development smoke tests, target-harness experiments, and
  held-out evaluation have separate statuses. Publish their actual scope;
  a ready code-review branch does not certify behavioral promotion.

For an independent smoke pass, give the evaluator only the selected arm's
skill, the prompt, and raw inputs. Withhold expected outputs/assertions until
grading. Keep candidate and baseline responses separate until both finish.
Inspect the artifact before editing instructions in response to a result.
