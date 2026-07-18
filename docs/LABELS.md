# Label System

All JacobPEvans repositories use a consistent labeling taxonomy defined in [`.github/labels.yml`](../.github/labels.yml).
This system ensures standardized issue classification, effort estimation, and workflow management across all projects.

## Overview

Labels are organized into five categories, each serving a specific purpose:

- **Type labels** categorize the kind of change and map to semantic versioning
- **Priority labels** indicate urgency for work prioritization
- **Size labels** provide effort estimation for planning
- **AI workflow labels** track AI-generated issues and approval state
- **Triage labels** help with administrative issue management

Labels are enforced through [issue templates](../.github/ISSUE_TEMPLATE/).
They are automatically applied via the [auto-label-issues.yml](../.github/workflows/auto-label-issues.yml) GitHub Actions workflow.

## Required Labels

### Issues

Every issue **must** have:

- **At least one** `type:*` label (can have multiple for complex changes)
- **Exactly one** `priority:*` label
- **Exactly one** `size:*` label

These requirements are enforced through dropdown fields in issue templates, ensuring consistent labeling from the moment an issue is created.

### Pull Requests

Every PR **must** have:

- **At least one** `type:*` label (can have multiple for complex changes)
- **Exactly one** `priority:*` label
- **Exactly one** `size:*` label

Unlike issues, PR labels are applied manually by the author or reviewers.
[Pull request templates](../.github/PULL_REQUEST_TEMPLATE/) include checklist sections that prompt contributors to apply appropriate labels.

## Label Categories

### Type Labels (`type:*`)

**Purpose**: Categorizes the kind of change and maps to semantic versioning for release planning.

| Label            | Description                             | Semver Impact |
| ---------------- | --------------------------------------- | ------------- |
| `type:bug`       | Something isn't working                 | PATCH         |
| `type:feature`   | New feature or request                  | MINOR         |
| `type:breaking`  | Breaking changes                        | MAJOR         |
| `type:docs`      | Documentation only changes              | -             |
| `type:chore`     | Maintenance, dependencies, tooling      | -             |
| `type:ci`        | CI/CD pipeline changes                  | -             |
| `type:test`      | Adding or correcting tests              | -             |
| `type:refactor`  | Code change with no functional change   | -             |
| `type:perf`      | Performance improvements                | -             |

**Note**: Type labels align with [Conventional Commits](https://www.conventionalcommits.org/) and semantic versioning to automate release management.

**Scope note**: `type:bug` covers code/repo defects — something in a
repository's code or config is broken. Operational incidents (production or
infrastructure anomalies, RCAs, postmortem-worthy events) are tracked as
Zammad tickets, not GitHub issues, and carry no `type:*` label.

### Priority Labels (`priority:*`)

**Purpose**: Indicates urgency and helps with work prioritization and sprint planning.

| Label                | Description                           |
| -------------------- | ------------------------------------- |
| `priority:critical`  | Urgent - requires immediate attention |
| `priority:high`      | Should be addressed soon              |
| `priority:medium`    | Normal workflow                       |
| `priority:low`       | Address when time permits             |

### Size Labels (`size:*`)

**Purpose**: Effort estimation for planning, workload balancing, and velocity tracking.

| Label      | Description      | Time Estimate |
| ---------- | ---------------- | ------------- |
| `size:xs`  | Trivial change   | <1 hour       |
| `size:s`   | Simple change    | 1-4 hours     |
| `size:m`   | Moderate effort  | 1-2 days      |
| `size:l`   | Significant work | 3-5 days      |
| `size:xl`  | Major effort     | 1+ weeks      |

**Note**: Time estimates are guidelines. Actual effort may vary based on complexity and familiarity with the codebase.

### Workflow Labels

**Purpose**: Tracks issue and PR lifecycle states, including AI-generated content and readiness for development.

#### AI Workflow Labels (`ai:*`)

| Label        | Description                                    |
| ------------ | ---------------------------------------------- |
| `ai:created` | AI-generated - requires human approval         |
| `ai:ready`   | Human-approved - ready for AI agent to work on |

**State Logic**:

- `ai:created` alone → Issue/PR needs human review before work begins
- `ai:created` + `ai:ready` → Issue/PR has been approved and is ready for implementation

This two-label system ensures AI agents can create issues autonomously while maintaining human oversight.

#### Development Readiness Labels

| Label | Description |
| --- | --- |
| `ready-for-dev` | Ready for development - all requirements clarified |
| `good-first-issue` | Good for newcomers - well-scoped and documented |

### Triage Labels

**Purpose**: Administrative labels for issue lifecycle management.

| Label        | Description                      |
| ------------ | -------------------------------- |
| `duplicate`  | This issue already exists        |
| `invalid`    | This doesn't seem right          |
| `wontfix`    | This will not be worked on       |
| `question`   | Further information is requested |

## Syncing Labels to Repositories

Labels defined in [`.github/labels.yml`](../.github/labels.yml) can be synced to other repositories using the [GitHub CLI](https://cli.github.com/):

```bash
# One-time sync from this repo to another
gh label clone JacobPEvans/.github -R JacobPEvans/TARGET_REPO --force
```

**About the `--force` flag**: This flag updates existing labels with new colors and descriptions, and creates labels that don't exist.
Without `--force`, the command will fail if any labels already exist in the target repository.

**Note**: Unlike community health files (CONTRIBUTING.md, etc.), labels are **not inherited** from the `.github` repository.
They must be explicitly synced to each repository.

For automated syncing across multiple repositories, consider using the [EndBug/label-sync](https://github.com/EndBug/label-sync) GitHub Action in each repository.

## Issue Template Integration

Issue templates in [`../.github/ISSUE_TEMPLATE/`][issue-templates] enforce the required label structure through a combination of frontmatter and dropdown fields:

[issue-templates]: ../.github/ISSUE_TEMPLATE/

- **Type labels**: Automatically applied via template frontmatter (`labels: ["type:feature"]`)
- **Priority labels**: Selected by issue author via dropdown field
- **Size labels**: Selected by issue author via dropdown field

### Available Templates

| Template           | Auto-Applied Label | File                  |
| ------------------ | ------------------ | --------------------- |
| Bug Report         | `type:bug`         | `bug_report.yml`      |
| Feature Request    | `type:feature`     | `feature_request.yml` |
| Documentation      | `type:docs`        | `documentation.yml`   |
| Chore/Maintenance  | `type:chore`       | `chore.yml`           |

Each template includes required dropdown fields for priority and size, ensuring every issue receives complete labeling at creation time.

### Automated Label Application

The [`../.github/workflows/auto-label-issues.yml`][auto-label-workflow] GitHub Actions workflow automatically extracts priority and size labels from dropdown selections.
It then applies them to newly created issues.
This automation eliminates manual labeling and ensures consistency.

[auto-label-workflow]: ../.github/workflows/auto-label-issues.yml

**Blank issues are disabled** via `config.yml` to ensure all issues follow the template structure and receive proper labels.

## Pull Request Label Requirements

Pull request labels follow the same taxonomy as issues but are applied differently:

- **Type labels**: Matched with conventional commit format in PR title (e.g., `feat:` → `type:feature`)
- **Priority labels**: Selected by PR author from required checklist
- **Size labels**: Selected by PR author from required checklist

[Pull request templates](../.github/PULL_REQUEST_TEMPLATE/) include:

- Conventional commit format guidance in comments
- Type-specific sections for comprehensive documentation
- Checklist section prompting for label application
- Links to [LABELS.md](LABELS.md) for label definitions

### PR Title Format

PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/) format:

**Format**: `type(scope): brief description`

This format enables:

- Automated semantic versioning based on commit types
- Consistent relationship between PR type and `type:*` labels
- Clear communication of change scope

**Examples**:

- `feat(api): add user authentication` → `type:feature`
- `fix(ui): resolve button alignment` → `type:bug`
- `docs(readme): update installation` → `type:docs`

## Canonical Source

The single source of truth for label definitions is [`.github/labels.yml`](../.github/labels.yml) in this repository.
All documentation, tooling, and automation references this file.

When updating labels:

1. Modify [`.github/labels.yml`](../.github/labels.yml) first
2. Update this documentation to reflect changes
3. Sync to other repositories using the `gh label clone` command
4. Update issue templates if new label categories are added

---

**See Also**:

- [`.github/labels.yml`](../.github/labels.yml) - Canonical label definitions with colors and descriptions
- [`.github/ISSUE_TEMPLATE/`](../.github/ISSUE_TEMPLATE/) - Issue forms that enforce label requirements
- [`.github/workflows/auto-label-issues.yml`](../.github/workflows/auto-label-issues.yml) - Automated label application workflow
- [Managing labels - GitHub Docs](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels)
