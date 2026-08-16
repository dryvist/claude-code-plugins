---
name: multi-model-review
description: Fan a plan or diff out to independent model families — a cloud coding-agent CLI, a cloud reasoning-agent CLI, and a local model server — for adversarial review, plus the gotcha each type of invocation hits. Use when a second (or third) opinion on a plan/diff is wanted from genuinely independent models, when one reviewer's verdict seems suspect, or when a local/offline reviewer needs to be brought up first.
---

# Multi-model review

Independent model families tend to converge on the same top issues — that
agreement is the signal worth the fan-out. Three invocation shapes cover most
setups: a **cloud coding-agent CLI** (sandboxed, repo-aware), a **cloud
reasoning-agent CLI** (general-purpose, also repo-aware), and a **local model
server** (OpenAI-compatible HTTP endpoint). Each has its own gotcha; skipping
past it wastes the whole review.

## Cloud coding-agent CLI (e.g. an MCP-integrated coding agent)

- Run it **read-only**: sandbox/approval flags set so it can inspect the repo
  but never edit it. Point it at the plan or diff path and let it read the
  repo itself rather than pasting the diff inline.
- **Account-pinned sessions reject explicit model overrides.** A session
  authenticated against a subscription account (rather than a raw API key)
  will error on a hardcoded model id with something like *"model X is not
  supported when using \<tool\> with a \<provider\> account."* Omit the model
  parameter and let the session use its account default; only pass an
  explicit override on a session backed by a raw API key.

## Cloud reasoning-agent CLI (e.g. a general-purpose agent CLI)

- Use the CLI's non-interactive single-prompt mode with explicit directory
  grants for whatever it needs to read — don't rely on default working-dir
  scope.
- It should be read-only by default (no auto-apply flag set); that's what
  makes it safe to fan a review out to without babysitting it.
- **Use the strongest reasoning tier, not the cheapest.** A fast/economy tier
  will run, but on a factual review of current tooling it can confidently
  hallucinate — e.g. claiming a tool "doesn't exist" or "was deprecated"
  because its knowledge predates the tool's current state. Pick the
  provider's top reasoning tier for anything that requires up-to-date factual
  grounding, not just code-quality opinion.

## Local model server (OpenAI-compatible)

- **Check the server is actually up before assuming a review failed.** If
  nothing answers the local port, the inference service is stopped — start
  it via its own service manager (systemd unit, launchd job, container),
  then poll the models endpoint until it reports loaded:

  ```sh
  curl -sf http://localhost:<port>/v1/models | jq -r '.data[].id'
  ```

- Send the review prompt straight to the real served model id (read from the
  `/v1/models` response — don't guess or reuse a name from documentation, it
  drifts).
- **Ground the model against its own knowledge cutoff.** A local or otherwise
  smaller model will confidently claim a tool released after its training
  cutoff "doesn't exist." Add one system-prompt line naming the current tools
  as real before asking for a review — this alone fixes most of the
  hallucinated-obsolescence failure mode.

## Running the fan-out

1. Give all three reviewers the **same** prompt and the same plan/diff path
   (or paste), with an instruction to review only, not modify.
2. Collect the three responses independently — don't let one reviewer see
   another's output; that's what makes agreement meaningful.
3. Points where **two or more** reviewers converge on the same issue,
   unprompted, are the highest-confidence findings — surface those first.
4. A single reviewer's unique finding is not automatically noise, but treat
   it with more scrutiny, especially if it depends on a claim about current
   tool behavior (checked directly, not from any reviewer's memory).

## Related

- **delegate-to-router** (ai-delegation) — for routing a bounded subtask
  through a shared OpenAI-compatible router instead of a direct local
  endpoint.
- **premium-agent-orchestration** (ai-delegation) — for the broader pattern
  of keeping a top-tier model on judgment while cheaper models handle
  checkable work; this skill is the review-specific fan-out case of that.
