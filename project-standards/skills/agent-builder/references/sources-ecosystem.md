# Ecosystem and research sources

Companion register to [builder guidance sources](sources.md): the model and
platform vendor records stay there; this file registers the ecosystem,
evaluation-framework, release, and research sources. Authoring coverage and
the rule trace live in [findings](findings.md).

## Contents

- [Dated source register](#dated-source-register)
- [Vendor register](sources.md)
- [Findings and rule trace](findings.md)

## Dated source register

| ID | Official source | Published or revised | Retrieved | Rules applied |
| --- | --- | --- | --- | --- |
| G1 | Google ADK, [agent evaluation](https://github.com/google/adk-docs/blob/628ed49787f83414995efd1b68f927778bad673f/docs/evaluate/index.md) | Revised [2026-10-16](https://github.com/google/adk-docs/commit/628ed49787f83414995efd1b68f927778bad673f) | 2026-11-06 | Evaluate observable tool trajectories and final response separately; choose metrics appropriate to the task. |
| G2 | Google ADK, [safety and security](https://github.com/google/adk-docs/blob/3a29a8df6e30ca5e36793b91a5249607104f8ccb/docs/safety/index.md) | Revised [2026-09-22](https://github.com/google/adk-docs/commit/3a29a8df6e30ca5e36793b91a5249607104f8ccb) | 2026-11-06 | Constrain identity, tool actions, and network access; treat injected content as untrusted. |
| G3 | Google, [ADK Python v2.14.0 release notes](https://github.com/google/adk-python/releases/tag/v2.14.0) | Released 2026-11-04 | 2026-11-09 | Run skill scripts from validated paths with an argument list; give each tool-argument check an explicit comparison mode: exact, case-insensitive, numeric tolerance, or semantic. |
| G4 | Google Cloud, [five rules for evaluating agent skills](https://cloud.google.com/blog/topics/developers-practitioners/evaluate-agent-skills-before-they-bloat-your-context-window) | Published 2026-11-03 | 2026-11-09 | Keep fixtures, grading scripts, and answer keys outside the tested agent's workspace with a separate verifier; reject revisions without measured gain over the previous version. |
| G5 | Google Cloud, [four eval engineering lessons](https://cloud.google.com/blog/topics/developers-practitioners/four-eval-engineering-lessons) | Published 2026-10-16 | 2026-11-09 | Pair plan-only cases with authorized disposable sandbox execution; preserve turn boundaries, parallel-call batches, and injection timing. |
| C1 | LangChain, [LangSmith trajectories](https://www.langchain.com/blog/langsmith-trajectories-tracing) | Published 2026-09-24 | 2026-11-09 | Evaluate complete multi-turn sessions; deduplicate repeated messages in ordered trajectories and retain the underlying traces. |
| C2 | LangChain, [context engineering starts with retrieval](https://www.langchain.com/blog/context-engineering-starts-with-retrieval) | Published 2026-10-23 | 2026-11-09 | Offload large retrieval payloads behind pointers; preserve source URLs and dates with results; test that claims cite and match retrieved material. |
| C3 | LangChain, [evidence-grounded agent memory](https://www.langchain.com/blog/building-agent-memory-openwiki-graphs) | Published 2026-10-28 | 2026-11-09 | Compare persistent memory with retrieval alone on matched simple-lookup and cross-source tasks before adopting it; report accuracy, citation consistency, latency, and the full cost of creating and updating the memory. |
| F5 | Langfuse, [skill management](https://langfuse.com/changelog/2026-11-03-skill-management) | Published 2026-11-03 | 2026-11-09 | Link skill observations to the canonical skill revision without creating another source of truth; the evaluation record carries the loaded skill version and the resource paths read. |
| F6 | Langfuse, [see when token usage is missing](https://langfuse.com/changelog/2026-11-06-retiring-tokenization) | Published 2026-11-06 | 2026-11-09 | Use provider-reported token usage or submitted costs; report missing usage separately from a missing price; never estimate either. |
| D5 | Dify, [1.17.0 release](https://github.com/langgenius/dify/releases/tag/1.17.0) | Undated release page; header shows 25 Aug without year | 2026-11-09 | Published agent builds capture the sandbox home snapshot later runs restore; preserve build snapshots for reproducibility. |
| D7 | Dify, [1.18.0 release](https://github.com/langgenius/dify/releases/tag/1.18.0) | Undated release page; header shows 23 Oct without year | 2026-11-09 | Portable app packages carry inline agents and skills and coordinated upgrades keep application and sandbox components compatible; pin application and sandbox contracts together and preserve skill versions for reproducibility. |
| D9 | Dify, [export and import apps](https://docs.dify.ai/en/self-host/use-dify/workspace/export-import-apps) | Updated 2026-11-04 | 2026-11-09 | Export the intended published version explicitly; workflow, agent, and skill exports carry saved draft changes; record what the export omits, such as plugin, credential, and model-provider bindings, as dependencies of the exported app. |
| D11 | Dify, [skills](https://docs.dify.ai/en/self-host/use-dify/build/skills) | Updated 2026-10-26 | 2026-11-09 | Skill exports can contain saved draft changes; export the intended version explicitly. |
| D12 | Dify, [agent node](https://docs.dify.ai/en/cloud/use-dify/nodes/agent) | Updated 2026-10-28 | 2026-11-09 | The Agent node carries the routing and failure handling: define exhaustive routes, an otherwise route, and failure handling for invalid results. |
| D13 | Dify, [AI agent or workflow](https://www.dify.ai/de/blog/ai-agent-or-workflow-how-to-choose-the-right-approach) | Published 2026-10-16 | 2026-11-09 | Workflows own schedules, branches, checks, approvals, and recovery: the scheduled-execution setting carries scheduling, the IF/ELSE node carries branching, the Human Input node carries approval, and node error handling carries recovery; keep the agent to the bounded, evaluable variable step of a mostly fixed process. |
| D14 | Dify, [1.19.0 release notes](https://github.com/langgenius/dify/releases/tag/1.19.0) | Released 2026-11-04 | 2026-11-09 | Temporary credential-refresh failures return temporary-unavailable errors; request re-authorization only when the credential is invalid. |
| R1 | arXiv, [Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge](https://arxiv.org/abs/2406.07791) | Preprint 2024-06-12 (background); revised [2025-11-11](https://arxiv.org/abs/2406.07791v9) for AACL-IJCNLP 2025 | 2026-11-09 | Judge verdicts can follow presentation position; re-present each comparison with the arm order reversed and keep verdicts that hold in both positions, measuring position consistency before trusting a randomized comparison. |

Rendered Google guides: [evaluation](https://adk.dev/evaluate/) and
[safety](https://adk.dev/safety/), both undated and retrieved **2026-11-06**.
Their retrieval does not date the rendered content. Apply the practices through the existing
platform, without introducing ADK or a second evaluation framework.
