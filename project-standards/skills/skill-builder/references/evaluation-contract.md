# Freeze the evaluation contract before experiments

For tuning or acceptance experiments, use the existing evaluator and Anthropic
skill-creator formats where supported. Draft requests end with the artifact
and unrun-check status; they do not require a completed experiment first.
Store authoring test inputs with the skill's evaluation resources, and retain
run outputs in the authorized evidence location. Separate these suites:

| Suite | Cases and observations |
| --- | --- |
| Should-trigger | Representative requests, paraphrases, and implicit requests within the skill's scope. Record actual activation. |
| Should-not-trigger | Adjacent tasks, vocabulary collisions, ordinary task execution, and explicit exclusions. Record false activation. |
| Execution | Production-shaped tasks with expected artifacts, deterministic assertions, and calibrated quality rubrics. |
| Held-out | Evaluator-owned trigger and execution cases frozen before tuning, hidden from the author and optimizer. |

Include malformed, ambiguous, oversized, unavailable-source, injected-input,
and unauthorized-action cases where relevant. Define expected refusal or stop
behavior as well as successful output. Explain each hard case's intrinsic
difficulty independently of current model failures; diagnose saturation,
universal failures, and permitted model/effort scaling (A3). Pair plan-only
cases with authorized disposable sandbox execution, grading actual tool
arguments, artifacts, and unauthorized effects separately. Agree numeric
acceptance thresholds
for trigger precision/recall, task correctness, privacy, latency, and cost
before the first experiment. Boundary violations must be zero.

Compare the candidate against **no skill** for a new skill, or the **previous
version** for an update. Use identical task inputs, permitted model settings,
tools, sandbox, and grader configuration. Disable the candidate and any
equivalent skill in the no-skill arm; load only the previous version in the
previous-version arm. Run repeated trials in fresh sessions so instructions,
cached artifacts, or writable memory do not contaminate the baseline.

Evaluate triggering independently of execution: present ordinary user requests
without explicitly invoking the skill and measure selection. Then test task
completion with the intended skill loaded. Compare real artifacts and tool
actions, not a model's claim that it followed the skill.
For tool-using skills, grade tool selection, arguments, permitted side effects,
and resulting state alongside final outputs, giving each argument check an
explicit comparison mode: exact, case-insensitive, numeric tolerance, or
semantic. Allow equivalent valid paths;
require call ordering only for a task invariant. Include denied operations,
handoffs, and retry/budget exhaustion. Evaluate complete multi-turn sessions
across handoffs, preserving turn boundaries, parallel-call batches, and
instruction-injection timing to detect actions dispatched before guidance
arrives; deduplicate ordered trajectories and retain the underlying traces.
Sources: G1, G3, G5, C1.

Record case IDs and suite versions, skill revision, harness and model settings,
grader version, actual activation, assertions, rubric scores, latency, cost,
and failures, attributing each span to its turn, tool call, and skill, linked
to the canonical revision without a second source of truth and carrying the
loaded skill version and the resource paths read (F5, O9); cost comparisons
use provider-reported usage or submitted costs, reporting missing usage
separately from a missing price without estimates (F6). Distinguish candidate failures from infrastructure failures,
truncation, grader disagreement, and run contamination. Calibrate open-ended
judges against human-reviewed examples. Report baseline deltas and variance;
do not claim an improvement that remains within noise. Reject a revision with
no measured gain over the previous version, and consider a skill with no
measured gain over no skill for retirement (A3, G4).
Before accepting or rejecting a revision, apply the grader-calibration
protocol; it lives once here and agent-builder applies it by reference.
Check each grader's pass rate in both arms. Use a judge model distinct from
the candidate and name it in the run record. Compare arms blind to identity,
randomizing their order per item; then repeat each comparison with the arm
order reversed and keep a verdict only when it holds in both positions,
treating a flip as position bias to repair in the grader before deciding
(R1). Grade a sample of identical outputs twice; fix disagreeing repeat
verdicts as grader noise before deciding. A grader at 0% in both or 100% in
both gives no signal; count it neither for nor against. Read its outputs,
recalibrate to one requirement per grader, and rerun both arms before deciding.

Keep held-out prompts and answers outside the author's tuning context. Have
the evaluator report aggregate results after the candidate is frozen. During
trials, keep fixtures, grading scripts, and answer keys outside the tested
agent's reachable workspace and let a separate verifier inspect artifacts
after exit; efficiency never offsets a failed correctness or security check
(G4).
Do not
tune on that set; an exposed case becomes development data and requires a
fresh held-out replacement before acceptance. Private cases and raw private
outputs stay in the authorized private evidence location.
