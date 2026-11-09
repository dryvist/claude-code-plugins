# Render and evaluate

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
- Shared evaluation-conduct rules live once in skill-builder's
  [evaluation contract](../../skill-builder/SKILL.md#freeze-the-evaluation-contract-before-experiments)
  and apply from there: hard-case difficulty with saturation and scaling
  diagnostics (A3), explicit argument comparison modes (G3), complete-session
  trajectory fidelity with injection timing, call batches, deduplication, and
  trace retention (G5, C1), plan-only pairing (G5), trial isolation (G4),
  provider-reported cost usage (F6), and grader calibration with its
  reversed-order position-bias check (R1).
- Compare persistent memory with retrieval alone on matched simple-lookup and
  cross-source tasks before adding it, reporting accuracy, citation
  consistency, latency, and the full cost of creating and updating the memory
  (C3).
- Prefer one agent with progressively disclosed
  skills and tools; keep a subagent only for measured context bloat,
  fresh-context parallelism, tool-selection or instruction conflicts, or a
  modular permission boundary. For consolidation, compare the current
  architecture with one folded subagent at a time on a shared end-to-end set
  that covers every production chain and protected rule. Repeat each case,
  inspect task-level flips, and compare routing accuracy before folding with
  skill or tool selection afterward; aggregate scores can hide handoff and
  routing regressions. Follow Anthropic's [subagent folding guidance][fold-subagents]
  (2026-10-22). This does not relax connector-agent boundaries, which stay
  mandatory. Source: A21.
- Reserve a held-out set with an independent evaluator. Keep its cases and
  answers outside the tuning context; freeze it before optimization. Source: A3.
- Use deterministic assertions for constrained outputs and calibrated,
  human-reviewed rubric judges for open outputs. Distinguish model failures
  from timeouts, truncation, grader variance, and stale state.

Run the repo-documented promptfoo command for both development and held-out
suites. Record prompt, dataset, model, evaluator, and configuration versions,
baseline deltas, uncertainty, and trace-linked results. Through the authorized
integration path, create a versioned Langfuse dataset with matching case IDs,
inputs, expected outputs, and scores; keep held-out answers evaluator-only.
An offline fixture is preparation, not evidence that the dataset exists.

[fold-subagents]: https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop
