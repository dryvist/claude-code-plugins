---
name: shape-issues
description: Shape raw ideas into actionable GitHub Issues using Shape Up methodology
---

# Shape Issues

Iterative issue exploration and shaping process that transforms rough ideas into well-defined,
time-boxed GitHub Issues using Shape Up methodology and continuous discovery principles.

> **Attribution**: Based on work by [roksechs](https://gist.github.com/roksechs/3f24797d4b4e7519e18b7835c6d8a2d3)

## Phases

1. **Problem Exploration**: Examine raw ideas, map pain points, assess timebox
2. **Solution Sketching**: Brainstorm approaches, set scope boundaries, identify risks
3. **Issue Formation**: Problem statement, timebox, solution sketch, rabbit holes
4. **Betting Table**: Prioritize by timebox, balance portfolio, set circuit breakers
5. **Issue Crafting**: Create GitHub Issues with size labels, add `ready-for-dev` label for developer pickup

## Sizing

| Label | Duration |
| --- | --- |
| `size:xs` | < 1 day |
| `size:s` | 1-3 days |
| `size:m` | 3-5 days |
| `size:l` | 1-2 weeks |
| `size:xl` | 2+ weeks |

## Workflow

1. Gather context: `gh issue list`, `gh pr list`
2. Explore problem: user complaints, workflow friction, timebox check
3. Sketch solutions: 2-3 approaches, scope boundaries, rabbit holes
4. Set timebox: spike vs small batch vs big batch
5. Create issue: `gh issue create` with template, add `ready-for-dev` label

## Issue Template

Key sections: Problem (raw idea, pain, size), Solution Sketch (concept, out of scope),
Rabbit Holes (complexity traps), Done Looks Like (acceptance criteria).

## Usage

```text
/shape-issues
```

**Workflow**: `/shape-issues` -> implementation -> `/ship`

## Related Skills

- pr-standards (github-workflows) — PR authoring and review standards applied after issues are implemented
