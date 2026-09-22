# Ensemble Mode detail

Use when the solution space is genuinely wide and one attempt would anchor
the answer: architecture choices, API or schema design, naming, a tricky
algorithm, a rewrite with several defensible shapes. **Not the default** —
for work with one obvious shape, a single delegate plus review is cheaper
and just as good, and the returns past three attempts are not worth the
spend.

Ensemble is still a downward delegation: the lead never competes in its own
ensemble, and the winner is chosen by the lead, not voted on by the
executors.

## 1. Diversify the prompts

Three executors, three *deliberately different* instructions. Identical
prompts produce correlated answers and buy nothing. Pick the axis by task
type:

| Task type | Axis | The three prompts |
| --- | --- | --- |
| Code generation | Constraint | optimize for **simplicity** / for **performance** / for **extensibility** |
| Architecture, design | Approach | **top-down** (requirements → interfaces) / **bottom-up** (primitives → composition) / **lateral** (analogy from another domain) |
| Creative, naming, docs | Persona | **expert** (precise, conventional) / **pragmatic** (ship-focused, explicit tradeoffs) / **innovative** (challenges the assumptions) |

Each prompt carries the full task context, its own optimization focus, the
constraints specific to that approach, and the expected output format.

Tier assignment follows the main skill's Model Tiers table — architecture
and design go to the strong-reasoning tier, code generation and creative
work to the mid-execution tier. Resolve those tiers live; never name a
specific model.

## 2. Score the results

Read every result against a fixed rubric so the choice is evidence, not
taste. Baseline weights, adjusted per task type:

| Criterion | Base | Code generation | Architecture | Creative |
| --- | --- | --- | --- | --- |
| Correctness | 30% | 35% | 25% | 20% |
| Completeness | 20% | 20% | 25% | 20% |
| Quality | 20% | 20% | 20% | 20% |
| Clarity | 15% | 15% | 15% | 15% |
| Elegance | 15% | 10% | 10% | 25% |
| *(added)* | — | Testability 10% | Flexibility 10% | Originality 10% |

Score 1–10: 9–10 production-ready, 7–8 minor polish, 5–6 needs work, 3–4
significant issues, 1–2 fundamentally wrong.

## 3. Select and report

Present the **full** winning result — not a summary — then the score table,
two or three sentences on the actual differentiator, and one line per
runner-up saying when it *would* have been the right pick. Graft a clearly
better idea from a runner-up into the winner rather than discarding it.

If an executor dies, score what came back and say how many ran; the main
skill's Substrate Resilience section covers degrading to serial or solo.

*Diversification strategies and the scoring rubric adapted from the
`ensemble-orchestrator` agent in [mhattingpete/claude-skills-marketplace](https://github.com/mhattingpete/claude-skills-marketplace)
(Apache-2.0), rewritten in capability-tier terms.*
