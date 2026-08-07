---
name: validate-readme
description: >-
  Validate all README files in the repository for required sections and
  installation code blocks, and score each one 0-6 on a quality rubric
  (purpose paragraph, quickstart, usage examples, license, length).
  Checks section presence using config from .readme-validator.yaml or
  sensible defaults. Badge URL reachability is checked on-demand via
  WebFetch.
---

# Validate README

Run a comprehensive audit of all README.md files in the current repository.

## Usage

```text
/validate-readme
```

## Steps

### 1. Find all README files

Find all `README*.md` files in the repository, excluding `.git/` and `.claude/`
directories.

### 2. Validate each README

For each README found, check:

- Required sections present (from `.readme-validator.yaml` or defaults)
- Installation section contains at least one code block
- Optional sections present (warnings only)

Badge URL reachability may be checked on-demand using WebFetch for any badge
images found in the README.

### 3. Score quality

Section presence is a floor, not a measure of quality — a README can carry every
required heading and still tell a reader nothing. Score each README 0-6 against
these checks and report the score alongside the pass/warn status. The lowest-
numbered failing check is the file's `gap`: the one thing most worth fixing.

| # | Check | Pass condition |
|---|-------|----------------|
| 1 | Exists | `README.md` present at the directory root |
| 2 | Purpose paragraph | First non-frontmatter, non-badge, non-heading paragraph is prose stating what the project does — at least 30 and at most 500 characters, not starting with a list bullet |
| 3 | Quickstart | A `## Quick Start`, `## Install`, `## Installation`, `## Getting Started`, or `## Setup` section appears within the first 80 lines |
| 4 | Usage examples | A `## Usage`, `## Examples`, or `## Example` section — or the Quickstart — contains a code block of at least 3 lines |
| 5 | License | A `## License` section, or a license badge linking to `LICENSE` / `LICENSE.md` |
| 6 | Length | Between 30 and 400 non-blank lines — below is a stub, above is a manual that should be split out |

Check 2 is the one that most often fails on a README that passes section
validation, and it is usually the most valuable to fix: a reader who cannot tell
what a project does from its opening paragraph will not read the rest.

Scope note: repo description and `CLAUDE.md` quality travel with README quality
but are not README checks. Leave them to the tools that own those files —
`claude-md-improver` (claude-md-management) covers `CLAUDE.md`.

### 4. Report results

Output a summary table:

| File | Score | Status | Gap |
|------|-------|--------|-----|
| ./README.md | 6/6 | PASS | -- |
| ./plugin/README.md | 4/6 | WARN | Check 2: no purpose paragraph |

## Configuration

Place a `.readme-validator.yaml` file anywhere in the directory tree above the
README being validated. The hook searches upward up to 10 levels.

```yaml
required_sections:
  - Installation
  - Usage
optional_sections:
  - Contributing
  - License
  - API
```

**Defaults** (used when no config file is found):

- `required_sections`: `Installation`, `Usage`
- `optional_sections`: `Contributing`, `License`, `API`

## Related Skills

- code-quality-standards (code-standards) — broader code quality standards that include documentation requirements
