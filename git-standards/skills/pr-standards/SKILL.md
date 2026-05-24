---
name: pr-standards
description: Use when creating PRs, linking issues, managing PR comments, or creating GitHub issues
---

# PR & Issue Standards

## PR Creation Guards

Run these checks in order before `gh pr create`:

**Guard 1 — Check for merged twin** (prevents zombie PRs):

```bash
gh pr list --repo JacobPEvans/<repo> --state merged --head <branch>
```

If merged PR exists AND `git log origin/main..HEAD --oneline` is empty:
STOP. Remove stale worktree.

**Guard 2 — Check for existing open PR** (prevents duplicates):

```bash
gh pr list --repo JacobPEvans/<repo> --state open --head <branch>
```

If open PR exists: `git push origin <branch>` instead of creating new PR.

**Guard 3 — Find related issues** (enforces linking):

```bash
gh issue list --repo JacobPEvans/<repo> --state open --search "<keywords>"
```

Include `Closes #X` or `Related to #X` in PR body. After creation:
`gh issue comment <num> --body "Implementation: #<pr>"`.

**Guard 4 — Validate branch has commits**:

```bash
git log origin/main..HEAD --oneline
```

If empty: no new work. Clean up instead.

## Workaround Classification

When reviewing a PR, distinguish a real fix from a workaround. Workarounds
become permanent tech debt if merged without acknowledgement. Four red flags:

1. **No upstream issue cited**: PR body does not name a specific upstream
   bug, version, or repository where the underlying problem lives.
2. **Phantom remediation mechanism**: PR body claims an automated "sync
   workflow", "auto-update", or "re-trigger" mechanism — verify with
   `grep -r <name> .` in the repo; if zero matches, the mechanism does not
   exist and the inline copy will drift silently.
3. **Asymmetric application**: the change is local to 1 of N similar
   consumers of a shared pattern (e.g. inlines 1 of 6 cross-repo imports),
   with no written rationale for the asymmetry.
4. **No exit criterion**: PR does not name the condition under which this
   workaround can be removed (upstream version, infrastructure change,
   deprecation date).

**Three or more red flags → recommend close, not merge.** Workarounds get an
upstream issue and an exit criterion before merging, or they are rejected.

Origin: 2026-05-22 `ansible-splunk` PRs #216 (asymmetric inline of 1 of 6
imports, references non-existent `gh-aw-sync-upstream` mechanism) and #218
(cron-retrigger band-aid with no exit criterion). Both reached
`mergeStateStatus: CLEAN` and would have merged under a mechanical-gate
review.

## Issue-PR Bidirectional Linking

Every PR body must include (bot PRs exempt):

```markdown
## Related Issues
Closes #X
```

Use `Closes #X` for full resolution (auto-closes on merge).
Use `Related to #X` for partial.

## AI Mention Policy

**NEVER tag AI assistants in PR comments** unless explicitly requesting
assistance. Do not tag to acknowledge fixes, notify of changes, or thank
for feedback. Just resolve the thread.

Exception: explicit requests like
`@gemini-code-assist review the security implications of this change`.

## Commit, PR Title & PR Description Style

No emoji or gitmoji in commit messages, PR titles, PR descriptions, or
release notes. Conventional-commit prefixes (`feat:`, `fix:`, `chore:`,
`docs:`, etc.) are required at the start of commit subjects and PR titles
only — descriptions and release notes are plain prose.
Applies to all PRs — human, AI-assisted, and bot-authored automated fixes.
No `🤖`, no `✨`, no `🐛`. The `type(scope):` prefix carries the signal.

## GitHub Issue Standards

### Title Prefixes

| Prefix | Use Case |
| --- | --- |
| `[FEATURE]` | New functionality |
| `[BUG]` | Something broken |
| `[DOCS]` | Documentation changes |
| `[REFACTOR]` | Code improvements |
| `[Small Batch]` | Scoped 1-2 week work |

### Required Labels

**Type** (pick one): `bug`, `enhancement`, `documentation`, `question`
**Priority** (pick one): `priority:critical`, `priority:high`,
`priority:medium`, `priority:low`
**Size**: `size:xs` (<1d), `size:s` (1-3d), `size:m` (3-5d),
`size:l` (1-2w), `size:xl` (2+w)

### Feature Issue Template

```markdown
## Problem
**Raw idea**: [concept]
**Current pain**: [what's broken]
**Size**: [xs|s|m|l|xl]

## Solution Sketch
**Core concept**: [approach]
**Out of scope**: [boundaries]

## Rabbit Holes
- [complexity traps to avoid]

## Done Looks Like
- [ ] Acceptance criterion

## Verification Steps
- [ ] How to verify

## Metadata
**Related Issues**: Blocks: #XX / Blocked by: #YY / Related to: #ZZ
```

### Bug Issue Template

```markdown
## What Happened
[Expected vs actual]

## Steps to Reproduce
1. Step one

## Context
**Environment**: [details]

## Done Looks Like
- [ ] Bug no longer occurs
- [ ] Regression test added

## Verification Steps
- [ ] Reproduce steps no longer trigger bug
```

Every issue MUST have explicit, checkbox-format acceptance criteria.

## Related Skills

- **review-standards** (code-standards) — Code review process and standards
- **rebase-pr** (git-workflows) — Rebase-merge workflow for merging approved PRs
- **finalize-pr** (github-workflows) — Finalize PR state before merging
- **git-workflow-standards** (git-standards) — Branch and worktree conventions that feed into PRs
