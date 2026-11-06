---
name: skill-builder
description: >-
  Create or revise a reusable harness skill with precise triggers, baseline
  comparisons, and held-out evaluation. Use for skill authoring or behavior
  changes; platform agent definitions and ordinary task execution use their
  own workflows.
---

# Skill builder

Deliver a portable skill directory and evidence that its triggering and task
outputs meet a declared evaluation contract. Extend the existing skill when
its scope already fits. Keep platform agent definitions and runtime prompts
in ai-llm-prompts; use agent-builder for that work.

## Establish scope and reuse authoring guidance

Identify the authorized repository/worktree, allowed files, target harnesses,
permitted models, network and service access, side effects, required checks,
stop conditions, and expected artifacts. A request to author a skill does not
authorize executing its deployment or privileged operations.

Read [claude-skill-authoring](../claude-skill-authoring/SKILL.md) for placement,
description budgets, and the self-contained rule. Use Anthropic's
[skill-creator][skill-creator] for baseline experiments and trigger evaluation,
and [plugin-dev:skill-development][skill-development] for plugin packaging.
Load installed copies with their complete resources and record their source
and version; if unavailable, consult the official sources without installing
unapproved tooling. Keep this platform's authority limits when applying their
general advice. Stop if required guidance or a prerequisite cannot be read.

Search the current skill/plugin registry and native tool capabilities before
adding resources. Prefer instructions and existing native tools. Add no custom
script, harness shim, or second evaluation framework. Stop on conflicting
requirements, missing authority, expanded scope, or the same check failing
twice after a real fix attempt.

## Freeze the evaluation contract before tuning

Use the existing evaluator and Anthropic skill-creator formats where supported.
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
behavior as well as successful output. Agree numeric acceptance thresholds
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

Record case IDs and suite versions, skill revision, harness and model settings,
grader version, actual activation, assertions, rubric scores, latency, cost,
and failures. Distinguish candidate failures from infrastructure failures,
truncation, grader disagreement, and run contamination. Calibrate open-ended
judges against human-reviewed examples. Report baseline deltas and variance;
do not claim an improvement that remains within noise.

Keep held-out prompts and answers outside the author's tuning context. Have
the evaluator report aggregate results after the candidate is frozen. Do not
tune on that set; an exposed case becomes development data and requires a
fresh held-out replacement before acceptance. Private cases and raw private
outputs stay in the authorized private evidence location.

## Author the smallest portable skill

Create `<plugin>/skills/<name>/SKILL.md` with YAML `name` and `description`.
Use lowercase hyphenated names matching the directory. State the exact task,
trigger conditions, and adjacent exclusions in the description. Keep it at
most **1,024 bytes**, targeting about **250 characters**; the public
specification's character limit is a separate measure.

Keep the skill body **under 500 lines**. Write concrete steps with observable
completion criteria. Keep essential prerequisites, authority limits, and stop
conditions inline so loading this skill alone remains safe. Link optional
references directly from the entrypoint; preserve every referenced resource
when distributing the directory. Put only task-specific knowledge here.

Keep automatic discovery unless the user requests explicit-only invocation.
Express any requested invocation policy in each target harness's native
metadata; Claude frontmatter and Codex `agents/openai.yaml` are distinct.
Preserve unrelated metadata. Test effective invocation in each target harness
rather than assuming one harness's settings apply to another.

Register the directory in the owning plugin's manifest and update its skill
listing. Reuse existing discovery and distribution; do not copy canonical
content into vendor directories. Keep agent prompts and logic out of Ansible
repositories, which accept input parameters only.

## Validate, compare, and deliver

Run the repository's `agentskills validate` loop, progressive-disclosure check,
plugin/schema validation, markdown lint, and commit hooks. Check UTF-8
description bytes explicitly if the validator only checks characters.
Run the frozen trigger and execution suites on the permitted target models
and harnesses, with candidate and baseline arms and independent held-out
evaluation. Improve against development cases only, then rerun affected checks.

Accept only when structural checks and declared behavioral thresholds pass,
no authority/privacy boundary is violated, and held-out results show no
regression. Preserve test evidence with the same change as the behavior.
Report changed paths, trigger precision/recall, task/baseline comparison,
held-out result, uncertainty, checks, and delivery status. Mark unavailable
behavioral runs as unverified; format validation alone proves no behavior.

Use these development cases to evaluate this builder; the independent
evaluator supplies separate held-out cases:

| Request | Trigger? | Observable acceptance |
| --- | --- | --- |
| Create a reusable skill for a recurring document transformation | Yes | Skill package plus trigger, execution, baseline, and held-out contract. |
| Improve an existing skill's triggering description | Yes | Previous-version comparison; independent trigger tests without explicit invocation. |
| Add a skill to an existing plugin | Yes | Manifest registration, complete resources, and repository validation. |
| Run the existing document-transformation skill on this input | No | Execute the existing skill rather than author another. |
| Define a scheduled platform agent | No | Agent-builder owns the definition and runtime prompt. |
| Edit a README paragraph | No | Ordinary editing workflow. |
| Release after format checks but without baseline or held-out results | Yes | Report missing behavioral evidence; keep acceptance blocked. |

[skill-creator]: https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
[skill-development]: https://github.com/anthropics/claude-plugins-official/blob/main/plugins/plugin-dev/skills/skill-development/SKILL.md
