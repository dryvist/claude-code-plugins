---
name: premium-agent-orchestration
description: Inject any time, including mid-task, to reset the session to lean orchestrator mode. Covers marathon or multi-workstream coordination and work larger than one context. Runs /agentops:orchestrate for dispatch and adds tiering, reserved decisions and fleet upkeep; keeps goals, gates, decisions, and final review in the parent.
---

# Premium Agent Orchestration

Run `/agentops:orchestrate` and follow it for every dispatch: packet checks,
write-scope collisions, launch, observation, recovery, judging results and
integration order. This skill adds only what that skill leaves to the caller.

## Reset to orchestrator (run on load)

Pause the current task and run this reset as soon as the skill loads.

1. Re-read the current goal or plan and its success criteria.
2. List every in-flight delegate and background job, with its task and
   current state.
3. Apply orchestrate's "Before any dispatch": judge each finished result
   against its named yes/no check, and reconcile before resuming.
4. Re-plan from live state and fan out every ready, independent task in
   parallel, each at its cheapest capable rung (below).
5. Schedule the idle sweep and the productivity check for the fleet.
6. Answer the user briefly with the current state, next step, or blocker.

## What the parent keeps

The parent keeps intent, goals, plans, design, risk, security, permissions,
migrations, data loss, shared state, concurrency, public interfaces,
user-visible risk, authority gates, integration and merge choices, and final
review. A worker may gather evidence for these; it never makes them.

The parent does not do bulk reads, searches, edits, test runs, log digging, or
long-output inspection. Do a handful of tool calls inline only when handoff
would cost more than the work.

## Cheapest-capable ladder

Choose an executor for each task, not for the whole project. Start at the
lowest rung that can meet the check. Haiku is the last resort, never the first
pick.

1. **Inline:** tiny work where handoff costs more than doing it.
2. **Local or free model:** text-only extraction, summaries, classification,
   and drafts from approved inputs.
3. **Untrusted low-cost tier:** work that uses public data only.
4. **Low-cost hosted worker:** other checkable work, including bounded code
   and tool tasks.
5. **Premium peer:** judgment that cannot be delegated. Choose below the
   parent's tier; never use a peer at your own tier.

Read prices, context-length price tiers, peak windows, and quotas live at call
time; never hard-code them. Split a task before it crosses its model's context
price tier, and prefer off-peak windows for bulk work that can wait. Executor
detail: `references/model-tiers.md`. The maintainer's own route is
`delegation-ladder` in `jpe-ai-delegation`.

Secrets, credentials, private data, and restricted information go only to an
executor approved for them; a public-data-only tier receives public data only.

## Briefs and tools

Put a static shared prefix first and task-specific text last in every packet,
byte-identical across calls, so matching calls hit the prefix cache.

One agent per tool. The session knows only the call contract: call this agent
with these inputs and expect this output. The agent runs on a local model and
carries the tool's instructions, so no other context does.

## Keep the fleet working

Every worker and subagent is working, waiting on a named event with a
background wake condition while its next item runs, or closed. While a job
runs, start the next piece of work in the same turn and arm a background wait that wakes the session when the job ends.
Never wake only to say "still waiting". Sweep for idle sessions on an interval shorter than the
prompt-cache lifetime, on the cheapest session that can do it, never the lead.
The procedure is in `references/fleet-utilization.md`.
