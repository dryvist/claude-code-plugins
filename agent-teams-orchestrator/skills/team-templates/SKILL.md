---
name: team-templates
description: Pre-configured team templates for common Agent Team workflows — review, debug, feature, repo-ops, and refactor
---

# Team Templates

Reusable team configurations for common workflows. Each template defines roles, models, task patterns, communication strategy, file ownership, and sizing guidance.

## Template Selection

| Goal | Template |
|------|----------|
| Review code | review-team |
| Find a bug | debug-team |
| Build a feature | feature-team |
| Update multiple repos | repo-ops-team |
| Refactor the codebase | refactor-team |

---

## 1. review-team — Multi-Perspective Code Review

**When to use**: High-stakes PRs, architectural decisions, multi-angle quality assessment.

### Team Composition

| Role | Responsibilities | Model |
|------|-----------------|-------|
| security-reviewer | Identify security vulnerabilities, auth flaws, data handling issues | Sonnet |
| performance-reviewer | Detect bottlenecks, inefficient algorithms, memory issues | Sonnet |
| test-reviewer | Assess test coverage, quality, and edge cases | Sonnet |
| quality-reviewer | Check style, maintainability, documentation, design patterns | Haiku |

### Configuration

- **Delegate mode**: Yes — no plan approval
- **Communication**: Broadcast for debate; write for individual reviews

### Task Pattern

1. Each reviewer examines the PR from their angle in parallel
2. Reviewers broadcast initial findings
3. Team debates contradictions (e.g., performance vs. security trade-offs)
4. Lead synthesizes findings into a priority-ranked report: critical / should-fix / nice-to-have

### File Ownership

None — all reviewers read the same PR independently. No lock needed.

### Sizing

| PR Size | Reviewers | Notes |
|---------|-----------|-------|
| < 500 lines | 2–3 | Drop quality-reviewer |
| 500–2 000 lines | 4 | Standard |
| > 2 000 lines | — | Split the PR first |

**Token estimate**: 80–120 K · **Runtime**: 3–5 min

---

## 2. debug-team — Competing Hypothesis Debugging

**When to use**: Intermittent bugs, unclear root cause, multiple failure theories.

### Team Composition

| Role | Responsibilities | Model | Count |
|------|-----------------|-------|-------|
| investigator-N | Test one hypothesis, gather evidence, broadcast findings | Sonnet | 3–5 |

One investigator per plausible hypothesis. Lead assigns hypotheses before spawning.

### Configuration

- **Delegate mode**: Yes — no plan approval
- **Communication**: Broadcast for findings and debate

### Task Pattern

1. Lead identifies hypotheses (e.g., "memory leak", "race condition", "API timeout")
2. Each investigator designs a test, executes it, and broadcasts results
3. Team debates which hypothesis best explains all symptoms
4. Lead names most likely root cause; one investigator runs final validation if needed

### File Ownership

Each investigator tests in isolation. No file conflicts.

### Sizing

| Bug Complexity | Investigators |
|----------------|---------------|
| 2–3 obvious hypotheses | 3 |
| 4–5 competing theories | 5 |
| > 5 hypotheses | Split into sub-teams |

**Token estimate**: 40–80 K per investigator · **Runtime**: 5–10 min

---

## 3. feature-team — Parallel Feature Development

**When to use**: Large features with independent components; tight deadlines.

### Team Composition

| Role | Responsibilities | Model | Count |
|------|-----------------|-------|-------|
| architect | Design, plan work breakdown, review implementations | Opus | 1 |
| implementer | Build assigned component following the architecture | Sonnet | 2–3 |
| tester | Write tests, validate integration, report issues | Haiku | 1 |

### Configuration

- **Delegate mode**: Yes
- **Plan approval**: Yes — architect must approve before implementers start

### Task Pattern

1. Architect designs overall structure and defines interface contracts
2. **GATE**: Architect waits for human approval on implementation plan
3. Implementers work in parallel on assigned components (no file overlap)
4. Checkpoints every 20–30 min: team broadcasts status and blockers
5. Tester writes integration tests as components finish
6. Architect reviews for architecture compliance; final integration run

### File Ownership

Architect assigns file ownership at design time. Each implementer owns distinct files. Tester writes new test files only.

### Sizing

| Feature Size | Team |
|---|---|
| 1–2 components | 1 architect + 1 implementer + 1 tester |
| 3–4 components | 1 architect + 2–3 implementers + 1 tester |
| 5+ components | Split into two feature-teams |

**Token estimate**: 300–600 K · **Runtime**: 30–60 min

---

## 4. repo-ops-team — Multi-Repository Operations

**When to use**: Cross-repo refactoring, bulk migrations, consistent updates across repos.

### Team Composition

| Role | Responsibilities | Model | Count |
|------|-----------------|-------|-------|
| repo-specialist-N | Handle assigned repo group, apply changes consistently | Sonnet | N |
| reporter | Aggregate results, identify failures, summarize changes | Sonnet | 1 |

Group repos by language, framework, dependency, or team ownership.

### Configuration

- **Delegate mode**: Yes — no plan approval
- **Communication**: Write for individual repos; broadcast for status and failures

### Task Pattern

1. Each specialist applies changes to their assigned repos, runs local tests, commits
2. Specialists broadcast completion status (success or failure with reason)
3. Reporter aggregates: per-repo status, summary of changes, failures needing human attention

### File Ownership

Each specialist owns their assigned repos completely. No inter-specialist conflicts.

### Sizing

| Repo Count | Specialists |
|---|---|
| 1–3 | 1 (skip the team) |
| 4–8 | 2–3 |
| 9–15 | 3–4 |
| > 15 | Split into two teams |

**Token estimate**: 60–120 K per specialist · **Runtime**: 10–20 min (parallel)

---

## 5. refactor-team — Large-Scale Refactoring

**When to use**: Codebase-wide refactoring, API changes, major restructuring.

### Team Composition

| Role | Responsibilities | Model | Count |
|------|-----------------|-------|-------|
| architect | Design strategy, plan file groupings, review changes | Opus | 1 |
| refactorer | Execute refactoring on assigned file set | Sonnet | 2–4 |
| reviewer | Cross-check consistency across refactorers | Sonnet | 1 |

### Configuration

- **Delegate mode**: Yes
- **Plan approval**: Yes — architect must approve before refactorers start

### Task Pattern

1. Architect defines scope, file groupings, pattern definition, and testing strategy
2. **GATE**: Human approves refactoring plan
3. Refactorers work in parallel on assigned file sets, running tests after each change
4. Reviewer samples files from each refactorer; broadcasts consistency findings
5. Architect reviews and coordinates final integration; full test suite runs

### File Ownership

Architect assigns disjoint file groups at design time. Reviewer is read-only. Architect handles shared utilities.

### Sizing

| File Count | Refactorers |
|---|---|
| < 100 | 1 |
| 100–500 | 2–3 |
| 500+ | 3–4 (max) |

**Token estimate**: 400–800 K · **Runtime**: 45–90 min

---

## Common Patterns

### Broadcast Critical Decisions

Broadcast immediately when a teammate discovers something that affects others:

- Architectural decision changed
- Integration blocker found
- Test failure affects another component
- Scope change required

### Checkpoint Frequency

- **< 30 min tasks**: One checkpoint at midpoint
- **30–90 min tasks**: Checkpoints every 20–30 min
- **> 90 min tasks**: Consider splitting into multiple teams

### Token Budget Validation

Before spawning, estimate cost from the template range. Add 20% overhead. If over session budget, reduce team size or split scope.

---

## When NOT to Use Agent Teams

Use single-model Claude instead for:

- **Simple tasks** (< 5 min complexity) — overhead exceeds benefit
- **Sequential pipelines** — task B requires task A's output
- **User interaction required** — teams cannot ask questions mid-run
- **Exploratory work** — teams need clear, bounded scope
- **Real-time feedback loops** — teams batch communication

---

## Related Skills

- **team-lifecycle** (agent-teams-orchestrator) — create, monitor, and clean up teams
- **teammate-communication** (agent-teams-orchestrator) — messaging best practices
