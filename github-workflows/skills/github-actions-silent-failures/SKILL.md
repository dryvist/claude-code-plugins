---
name: github-actions-silent-failures
description: Diagnose GitHub Actions workflows that fail silently — a reusable-workflow run that shows zero jobs and no logs (startup_failure), a gh-aw cross-repo import that mis-resolves when the source repo is literally named .github, and self-hosted-runner traps (a shared-tmp race across containers, docker exec landing as an unprivileged user). Use when a required check never turns red, a workflow run has no jobs at all, or a self-hosted-runner failure looks flaky but keeps recurring.
---

# GitHub Actions silent-failure diagnostics

Three unrelated GitHub Actions failure classes that share one property: none
of them produce a red check where you'd expect to look. A required gate can
go dark for months with nobody noticing, because there's nothing red to see.

## Runs that fail with zero jobs (`startup_failure`)

A caller workflow can fail at **run creation**, before any job exists. The
run shows `startup_failure`, an empty jobs list, and no logs — nothing
failed, because nothing ran. In the worst recorded case a repository's CI
gate startup-failed on every run for five months (~420 runs): no lint,
schema, or content check executed in that window, and merges proceeded on a
separate gate alone.

**The API will not tell you why.** `gh run view` and the REST/GraphQL APIs
report only `startup_failure` and a generic "workflow file issue" — the real
error text exists only on the run's HTML page. Any triage that stops at
`gh run view` concludes "no useful information" and moves on, which is how
this stays undiagnosed. Fetch the run's HTML page to read the actual error.

Four distinct causes produce this exact symptom:

1. **A nested job's permissions exceed the caller's grant.** GitHub
   validates *every* nested job of every referenced reusable workflow
   against the calling job's permission grant at run-creation time —
   including jobs whose `if:` condition would have skipped them. One
   mismatch fails the entire caller run. Fix by either granting the needed
   permission at the call-site job, or dropping an unused permission from
   the nested job.
2. **`permissions: {}` at workflow level on a cross-repo `workflow_call`.**
   An empty permissions block means the token gets zero grants. Empty is
   not the same as default, and this startup-fails instantly.
3. **A `type: number` `workflow_call` input receiving a string.** A caller
   passing `"659"` to a `number`-typed input startup-fails silently. Prefer
   `type: string` consistently on `workflow_call` inputs — the value gets
   interpolated as text anyway.
4. **Two jobs in one workflow calling the same reusable workflow.** The
   second job silently disappears — no error, no YAML complaint, just
   absent from the run. This is the one variant that does *not* report
   `startup_failure`; it quietly does less than the file says.

**Detection:** `startup_failure` + empty jobs list + a generic workflow-file
message is the signature. Audit every `permissions:` block in the run's
`referenced_workflows` (an API field on the run) against the caller's grant,
and list recent runs looking for an unbroken stretch of `startup_failure` —
that's the five-months-dark shape.

**After the repair, expect a backlog.** Months of unchecked content
accumulates real lint failures that all surface the moment CI works again.
Budget for that flood as the fix working, not as a new regression.

## gh-aw cross-repo imports break when the source repo is named `.github`

`gh-aw` (GitHub Agentic Workflows) supports importing shared content from
another repo via `imports: OWNER/REPO/.github/workflows/shared/file.md@ref`.
**If `REPO` is literally `.github`, this silently miscompiles.** `.github`
is GitHub's own convention for org-wide defaults, so it's a natural (and
wrong) place to put shared gh-aw content.

**Failure signature:** the run reaches the activation job (so it's not the
zero-jobs pattern above — jobs do run), then fails mid-step:

```text
ERR_SYSTEM: Runtime import file not found:
  .../<owner>/.github/.github/workflows/shared/<file>.md@ref
```

The tell is the **doubled `.github/.../.github/` path segment** — distinct
from an ordinary typo'd import path. Root cause: the compiler locates the
import root with `strings.LastIndex(path, "/.github/")`. When the source
repo is itself named `.github`, the fetched path already contains
`OWNER/.github/...` before the workflow's own `.github/workflows/...`
segment starts — two `/.github/` substrings. `LastIndex` picks the wrong
one, prepending an extra `.github/` that doesn't exist on disk.
`inlined-imports: true` does not work around this — it still emits a
runtime-import macro for cross-repo imports, so the bug still fires.

**Fix: never host gh-aw shared content in a repo named `.github`.** Move it
to any other repo. This is the opposite of the general GitHub convention
(ordinary reusable `workflow_call` workflows correctly live in and inherit
from an org's `.github` repo) — this bug is specific to gh-aw's own custom
import-resolution code, not to reusable workflows in general. Don't
generalize the fix beyond gh-aw imports.

## Self-hosted runner traps

Two failures specific to a fleet of self-hosted runner *containers* (as
opposed to GitHub-hosted runners), both easy to misdiagnose as flakiness or
a broken script.

**A "flaky, just rerun it" failure can be a shared-tmp race, not
flakiness.** If every runner container shares a mutable home directory
(e.g. a package-manager cache under `$HOME`), concurrent installs into that
shared path can race and leave a corrupted artifact that then fails
*every subsequent* install on that same container — surfacing on completely
unrelated jobs, in about a second, with no connection to the failing job's
own content. Diagnose by correlating **job to runner container**, not to the
job's content: if every failure sits on the same one or two containers while
identical jobs on other containers pass, it's container state, not test
flakiness. Fix by giving each job a unique, job-scoped temp/cache directory
(most CI runner environments expose a per-job temp path) instead of sharing
one across concurrent jobs on the same container.

**`docker exec` into a runner container lands as whatever user the image's
Dockerfile set, not root.** If the image sets `USER runner` (or similar),
`docker exec` executes as that user by default. A cleanup or diagnostic
script that assumes root and doesn't pass `-u root` (or `sudo`, if the image
grants it) fails with `Operation not permitted` on every file it touches —
and if that script also counts "how many are left" *before* the delete and
redirects stderr to `/dev/null`, it can print a plausible "removed N" while
deleting nothing. Any cleanup script against a container fleet should verify
the **post-delete** count with stderr visible, never just an inferred
before/after count.

## Related

- **gh-cli-patterns** (this plugin) — canonical `gh` CLI command shapes;
  useful when building the `referenced_workflows` audit above.
