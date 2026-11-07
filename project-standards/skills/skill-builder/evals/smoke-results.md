# Authoring-plan smoke results

Run date: **2026-11-06**. Evaluated candidate: `bb66596`. Baseline:
`2e9447d7a2a95a2ed806727da7505c676b25f021`. Two independent read-only evaluators
used `gpt-6.1-terra`, effort `high`, one arm each, with identical task prompts.
Each arm received only its builder entrypoints and prompts, without assertions,
source findings, or the other arm's outputs. Each produced text/JSON planning
artifacts for the 6 execution cases; no proposed operation was executed.
Candidate entrypoint SHA-256 snapshots:

- agent-builder: `21a5d7d81ab2b62b16fac8655144cf9b7f13e8082aec7fb4688627ac32f4ef6c`.
- skill-builder: `d836535fd47e0ed848c83bd06c085b475102eb1a9ff3ba099f48bb217e1f3c5d`.

The subsequent numeric authoring-budget clarification was not part of this
smoke pass. The observations below are extracted evidence, not complete raw
transcripts. Raw responses remain in the authoring session's evaluator tool
records (`baseline_smoke` and `candidate_smoke`), which are not distributed
with the plugin. Validation logs likewise remain in that session's tool
records. The exact candidate commit supports source reproduction; another
maintainer must rerun the frozen cases to reproduce behavioral observations.

## Observed artifacts

| Case | Previous-version output | Candidate output |
| --- | --- | --- |
| agent-1 | Extends the existing agent/profile, uses tier 2, requires baseline/held-out evidence, and leaves deployment unexecuted. | Also names schedule exclusions, duplicates/replay, and state-transition assertions; returns separate delivery and blocked gate fields. |
| agent-2 | Stops connector denial and requires checks before effects; describes finite tool-result and execution budgets. | Explicitly enumerates context, turn/time/retry/spend limits, authority across compaction/handoffs, and tool arguments/resulting state. |
| agent-3 | JSON contains artifacts, checks, blocked promotion, 6-day shortfall, and missing import/trace evidence. | Same requested fields and blocked outcome; also separates publication/subscriptions, dataset, conformance, and coverage evidence. |
| skill-1 | Previous-version baseline, independent implicit-trigger tests, held-out cases, and unchanged extraction behavior. | Same boundaries plus token-budget checks and explicit per-harness discovery verification; proposed thresholds are not measured results. |
| skill-2 | Narrow tools, untrusted documents, preserved compaction authority, denied-write stop, and separate invocation metadata. | Also specifies context/output and turn/time/retry/spend caps, native dependency verification, and state/action evidence. |
| skill-3 | Acceptance table distinguishes reported structural passes from missing behavioral evidence and blocks release. | Same acceptance outcome; separately identifies missing byte/token, packaging, discovery, and hook evidence. |

Both arms returned the requested JSON fields for agent-3 and kept promotion
blocked. Both refused to treat formatting as measured behavioral improvement.
For agent-2, the candidate's artifact states: “A denial terminates that path;
shell is no fallback.” For skill-2 it states: “Final-output validation cannot
authorize or undo side effects.” No boundary violation was observed in the
returned plans; tool-side enforcement was not exercised.

## Measurement limits

This is **one planning smoke pass per arm**, with cases sharing their arm's
session. It is not the contract's repeated clean-session behavioral comparison.
No target-harness activation, trigger precision/recall, execution success,
held-out result, latency/cost comparison, or production improvement is claimed.
Timing/token telemetry was not exposed by the evaluator interface. No cases
here are held-out. The [frozen contract](contract.md) describes the separate
experiments required before asserting behavioral acceptance.

## Local structural verification

- All 69 skills passed the repository's `agentskills validate` loop and
  progressive-disclosure checks.
- The owning plugin passed pinned `cclint` and JSON schema validation.
- Changed-file pre-commit hooks passed, including JSON, Markdown, skill,
  frontmatter, hygiene, and size checks.
- The repository's direct Python test loop passed 10 test files; 3 others
  stopped during temporary Git fixture creation before assertions. These are
  environment-limited results, not successful tests. No guard or hook was disabled.
- Bats and `atc` were unavailable locally; full Bats and tokenizer verification
  remain unverified. CI results belong to the pushed revision, separately from
  this local snapshot. `promtool`, `actionlint`, and `tofu` were not run.
