---
name: agent-builder
description: >-
  This skill applies when authoring platform agents, prompts, or evals, or
  reviewing promotion evidence and go-live decisions, even without edits.
  It excludes running existing agents, processing their reports, and harness
  skill authoring.
---

# Agent builder

Produce one canonical agent package in `dryvist/ai-llm-prompts/agents/`, or
the authorized private twin. Keep private content in the private repository.
This skill supplies authoring instructions, never a second agent definition.
For provenance or a refresh, consult the dated [sources and findings](references/sources.md).
For builder regression testing, use the [native suite](../../evals/agent-builder/native/).
Follow the shared [eval contract](../../evals/skill-builder/contract.md) for comparisons.

## Establish the contract

For evidence-only reviews, apply the inline promotion and acceptance gates to
the supplied record. Return the requested decision with missing evidence;
do not require authoring schemas or templates, search for unsupplied artifacts,
or run deployment operations. Authoring prerequisites apply when changing a
definition, prompt, or evaluation package. Sources: A1, O1; local policy E2.

For authoring, read repository instructions, v2 schema, standards, connector roster,
template inputs, evaluation runner, and import guide.
Search for an existing agent or native feature that already performs the job.
Extend it when appropriate; add no custom script where an existing tool works.
Use [plugin-dev:agent-development][agent-development] for role design, while
retaining the platform YAML format rather than a harness-specific definition.
Keep one focused responsibility per agent. State when requests should route
elsewhere, and reuse shared defaults/profiles for values used by multiple
definitions; each agent declares only its differences.

Record the job, inputs, output schema, completion criterion, permitted tools,
and authority boundary. Identify the authorized worktree and paths, network
and service permissions, required checks, stop conditions, and delivery format.
Proceed within those boundaries. Stop for a conflicting contract, missing
schema/template/connector, missing authority, or the task's declared failure
limit. If none is supplied, stop after 2 unsuccessful real fixes to the same
check. Report the specific blocker without inventing defaults. Authoring does
not authorize import, publishing, or live execution; perform those stages only
within the task's service permissions.

## Author the canonical inputs

Search canonical definitions first for an agent with the same responsibility.
If one exists, reuse or extend it and name it; never author a duplicate.

Create or update `agents/<name>.yaml`, its `agents/prompts/` prompt, and its
evaluation inputs. Take field types and allowed values from the current schema;
retain other required fields, including tool allowlists and routing roles.

| v2 field | Required decision |
| --- | --- |
| `tier` | `0` interactive, `1` event-driven, or `2` batch. |
| `triggers` | Calls, supported events, or schedules with filters and input contracts. |
| `privacy_class` | Schema-approved class and permitted data destinations; private work stays local. |
| `connectors` | Named connector agents from the roster, with only the operations needed. |
| `code_work` | Declare whether code work is required; all edits, git, and tests run in agent-sandbox jobs. |
| `mode` | Start in `shadow`; `live` requires the promotion evidence below. |
| `eval_set` | Existing runner's path to this agent's versioned regression suite. |

Each integration has exactly one connector agent, its sole credential holder.
All other agents, including sandbox jobs, call that connector by name over
Agent-to-Agent (A2A) through agentgateway with verified caller identity and
roster-derived peer permissions. Reuse the connector; never issue callers
integration credentials or implement a second direct integration path.

The live home is Dify; Sim and Langflow receive shadow copies of the same
definition. Hermes calls agents and hosts no agent definitions. Keep prompts,
agent logic, template inputs, and runtime exports in the prompt repository;
Ansible roles accept deployment input parameters only.

Write only the role-specific prompt and reuse the canonical shared prefix.
Declare tools narrowly. Treat retrieved content and writable memory as
untrusted inputs; enforce permissions through runtime controls. For recurring
work, preserve source bookmarks on failed reads and advance delivery state
only after confirmed receipt. Return unavailable sources explicitly.
Keep preferences read-only. Define tool purpose, constrained arguments,
structured results, and actionable errors in the tool interface. Filter or
paginate results; annotate read-only, destructive, and idempotent operations.
Metadata grants no authority. Verify filesystem, network, and connector
restrictions separately from approvals. Enforce consequential calls before
execution, including after handoffs; output checks cannot undo side effects.
Stop on denial or exhausted budget without broadening tools or credentials.
Sources: A2, O2, G2.

## Bound context and execution

Keep task-specific decisions and costly gotchas; specify outcomes rather than
reasoning recipes. Load references for the current branch and retain safety
inline. Measure prefix, tool schemas, skill index, retrieval, and output
reserve with the serving tokenizer against configured budgets. Dedupe and
filter before expanding context. Use native compaction, preserving decisions,
artifact/trace IDs, pending work, and authority; re-read live state before
writes. Configure turn, time, retry, and spend caps with terminal partial/blocked
results on exhaustion. Re-evaluate after model/harness changes. Sources: A1, O1, O3.

Use agent names and tier numbers. Select a capability/routing role, never a
model from memory. Model selection requires a dated live-source dossier and
the shared age policy; an undated or over-12-month-old model fails closed.
Tier 2 stays local and may wait 12 hours. Tiers 0–1 follow privacy-class cloud
policy; a key-only request requires zero data retention (ZDR).

## Render and evaluate

Supply the definition and prompt as inputs to the repository's one standard
template and off-the-shelf renderer. Generate Dify, Sim, and Langflow exports;
never hand-write their runtime files or copy prompts into per-agent fragments.
Run the repository's conformance and render-drift checks. Stop if the shared
pipeline is unavailable rather than adding a renderer in this skill.

Before tuning, set measurable thresholds for correctness, privacy, latency,
cost, and boundary violations. Extend the existing promptfoo runner and its
coverage manifest; ensure the new suite actually enters the executable matrix.

- Positive cases exercise production-shaped inputs and the output schema.
- Test call/event/schedule activation and exclusions separately from execution;
  include duplicate events and replay. Check tool choice, arguments, handoffs,
  denied calls, and resulting state as well as the final answer. Require exact
  ordering only where correctness depends on it. Source: G1.
- Negative cases cover malformed or ambiguous inputs, oversized requests,
  unavailable sources/connectors, injected instructions, unauthorized actions,
  credential requests, and attempts to edit outside sandbox jobs.
- Compare against the current version, or a no-agent baseline for a new agent,
  using the same permitted model, configuration, cases, and repeated clean runs.
- For optional subagent consolidation, compare the current architecture with
  one folded subagent at a time on a shared end-to-end set that covers every
  production chain and protected rule. Repeat each case, inspect task-level
  flips, and compare routing accuracy before folding with skill or tool
  selection afterward; aggregate scores can hide handoff and routing
  regressions. Follow Anthropic's [subagent folding guidance][fold-subagents]
  (2026-10-22). This does not relax connector-agent boundaries, which stay
  mandatory.
- Reserve a held-out set with an independent evaluator. Keep its cases and
  answers outside the tuning context; freeze it before optimization.
- Use deterministic assertions for constrained outputs and calibrated,
  human-reviewed rubric judges for open outputs. Distinguish model failures
  from timeouts, truncation, grader variance, and stale state.

Check every grader's pass rates in both arms before accepting or rejecting a revision.
Require a judge model different from the candidate; record the judge's name with the run.
Blind the judge to arm identities and randomize arm order for each item.
Grade identical outputs twice on a sample; resolve repeat-verdict disagreement as grader noise before deciding.
At 0% in both or 100% in both, a grader gives no signal toward either decision.
Inspect its outputs, fix it to grade one requirement, and rerun both arms before deciding.
Run the repo-documented promptfoo command for both development and held-out
suites. Record prompt, dataset, model, evaluator, and configuration versions,
baseline deltas, uncertainty, and trace-linked results. Through the authorized
integration path, create a versioned Langfuse dataset with matching case IDs,
inputs, expected outputs, and scores; keep held-out answers evaluator-only.
An offline fixture is preparation, not evidence that the dataset exists.

## Import and prove shadow operation

Use the official [difyctl guidance][difyctl] and the installed `difyctl --help`
to discover import operations and arguments for the target client/server pair.
Import the generated Dify artifact as a draft through the authorized deployment
path. If import is unsupported, stop and report the version mismatch; do not
substitute custom API glue. Record the app ID and imported artifact version.

Check provider bindings, connector permissions, omitted resources, triggers,
output contracts, failure routes, pause/resume behavior, and rollback version.
Test the draft before publishing a shadow version with `mode: shadow`, then
verify its published trigger subscriptions before starting the shadow interval.
Keep secret values out of exports and logs. Send traces for every run to the
configured observability backends; prove correlated trace receipt and successful
execution separately.
Every event carries `agent`, `tier`, `privacy_class`, `model`, and `accelerator`.
Sim and Langflow shadows must suppress external side effects.

Ship a `mode` change only as a PR reviewed and merged by the supervising lead.
Passing evidence makes that PR eligible; it never authorizes publishing the change directly.

Promote only when promptfoo evals pass and **7 days in shadow show no drop in
Langfuse scores** against the versioned baseline. Missing scores or insufficient
coverage block promotion. Submit the evidence and `mode` change through the
promotion-review PR workflow; the supervising lead reviews and merges it.
Regression produces the reverse PR for demotion. Every mode flip is recorded
through the task connector. Keep ongoing sampled evaluation enabled.

## Acceptance evidence

Report definition/prompt/input paths, rendered artifacts, conformance and
promptfoo results, baseline and held-out evidence, Langfuse dataset version,
import ID, run and trace IDs, and shadow interval with score comparison.
Mark each unexecuted gate as blocked. Source validation, import, execution,
trace receipt, and live promotion are separate deliverables.
Define machine-consumed outputs with the repository's supported schema and
validate them before delivery. Include status, artifact references, completed
checks, and a reason for partial/blocked outcomes; preserve the caller's exact
output contract. Keep secrets and raw private inputs out of public evidence.

[agent-development]: https://github.com/anthropics/claude-plugins-official/blob/main/plugins/plugin-dev/skills/agent-development/SKILL.md
[difyctl]: https://dify.ai/blog/dify-s-official-cli-difyctl-ships
[fold-subagents]: https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop
