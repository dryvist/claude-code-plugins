---
name: premium-agent-orchestration
description: Inject any time, including mid-task, to reset the session to lean orchestrator mode. Covers marathon or multi-workstream coordination and work larger than one context. Plan and fan out checkable work to the cheapest capable executor; keep goals, gates, decisions, and final review in the parent.
---

# Premium Agent Orchestration

## Reset to orchestrator (run on load)

Pause the current task and run this reset as soon as the skill loads.

1. Re-read the current goal or plan and its success criteria.
2. List every in-flight delegate and background job, with its task and
   current state.
3. Judge each finished result against its named yes/no check. Accept it or
   record the shortfall.
4. Re-plan from live state: completed work, open checks, dependencies, and
   blockers.
5. Fan out every ready, independent task in parallel to the cheapest capable
   executor.
6. Keep for yourself only intent, goals, plans, design, risk, authority
   gates, integration and merge choices, and final review.
7. Answer the user briefly with the current state, next step, or blocker.

## The parent's job

The parent session orchestrates. It sets goals and plans, defines task
boundaries, makes design and risk decisions, holds authority gates, integrates
results, decides what may merge, and reviews the final work.

The parent does not do bulk reads, searches, edits, test runs, log digging, or
long-output inspection. Delegate that volume to the cheapest capable executor
and ask for a short result with evidence. Keep only judgment and coordination
in the parent.

Do a handful of tool calls inline when delegation setup, prompt writing, or
result handoff would cost more than the work. If a task contains routine work
and a hard decision, delegate the evidence gathering and keep the decision.

## Cheapest-capable ladder

Choose an executor for each task, not for the whole project. Start at the
lowest rung that can meet the check.

1. **Inline:** tiny work where handoff costs more than doing it, such as a few
   simple tool calls.
2. **Local or free model:** text-only extraction, summaries, classification,
   and drafts from approved inputs.
3. **Untrusted low-cost tier:** work that uses public data only.
4. **Low-cost hosted worker:** other checkable work, including bounded code
   and tool tasks.
5. **Premium peer:** judgment that cannot be delegated. Choose below the
   parent's tier; never use a peer at your own tier.

At call time, read current prices, context-length price tiers, peak and
off-peak windows, and quotas from the router or provider. Never hard-code
prices, model names, or availability. Keep each worker below its model's
context price tier. Split a task before it crosses that tier. Prefer off-peak
windows for bulk work that can wait.

## Brief each task

Give each worker one outcome, the exact inputs it may use, and a yes/no check.
Put a static shared prefix first and task-specific text last so matching calls
can use prefix caching. Keep the shared prefix byte-identical when the
executor supports caching.

Use this compact brief:

```text
Use only the supplied scope and inputs. Do not expand the task, make reserved
decisions, or ship work. If blocked, stop and report why. Return only the
stated output contract.

Goal and intent: [what outcome is needed and why]
Exact scope and what not to touch: [files, data, systems, boundaries]
Constraints and decisions: [paste the applicable constraints and decisions]
Success check (yes/no): [one concrete pass condition]
Output contract: [one line or exact schema]
Stop and report: [the point to stop, or the blocker to report]
Difficulty and risk: [plain words]
```

## Judge every result

A delegate's output is a claim until its check passes.

- Compare the returned artifact and evidence with the named yes/no check.
- Send failures back with the specific shortfall and the next check to pass.
- Split oversized tasks into smaller pieces with separate checks.
- Never let unreviewed output ship or merge. The parent owns the final review
  and gate.

## Boundaries and high-risk work

Do not send secrets, credentials, private data, or restricted information to
an executor unless that executor is approved for it. A public-data-only tier
receives public data only.

The parent keeps decisions about intent, design, security, permissions,
migrations, data loss, shared state, concurrency, public interfaces, and
user-visible risk. A worker may gather evidence or complete a scoped change,
but it does not make reserved decisions or approve its own result.

## Substrate resilience

Check live executor availability and limits before a fan-out. Respect
concurrency, quota, and rate limits. Give background work a clear stop
condition and bounded waits. If a call fails, record the failure, then
re-plan or choose the next eligible executor. Do not poll forever or silently
absorb a failed task into the parent.

## Token discipline

- Batch related asks when one worker can handle them under one clear check.
- Pull back conclusions and supporting evidence, not full dumps.
- Do not re-read material a delegate has already summarized unless the check
  or risk requires it.
- Fork a separate context only when the task truly needs one.

## Related skills

- `local-subagents` — choose and use local or low-cost model tiers.
- `fast-subagent` — send routine, checkable work through a fast local route.
- `delegate-to-ai` — general safeguards for bounded delegation.
- For the maintainer's own route, see `delegation-ladder`.
