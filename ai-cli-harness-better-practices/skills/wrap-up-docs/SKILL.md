---
name: wrap-up-docs
description: "Emit one paste-ready prompt for a local (weaker) LLM whose sole job is updating public and private documentation to match every technical change this session made — an exhaustive per-item changelog (file/component path, what changed technically, commit SHAs, PR URLs, why), routed between public repo docs and the private docs site by fixed rules, wrapped in zero-inference instructions and a documentation-only scope fence. Read-only: emits the artifact, writes nothing. Git-first evidence (working-tree status, commits ahead of upstream, PRs) with a conversation-history scan for rationale; runs outside a repository too. Use at end of session when docs must catch up, especially before delegating doc updates to a less capable model."
---

# Wrap-Up Docs

Produce exactly one artifact: a paste-ready prompt for a weaker local LLM that
will update documentation. The consuming model sees none of this conversation
and must not be asked to infer — the prompt carries every change explicitly,
with instructions requiring no judgment beyond writing prose.

Emit the prompt and stop. This skill creates no tracker items, edits no files,
runs no cleanup — `/wrap-up` owns those. It is the documentation counterpart to
`/handoff`: same artifact class (self-contained prompt for a context-free
consumer), opposite compression strategy. Where `/handoff` compresses for a
smart reader, this skill expands for a weak one.

> **State warning**: TaskList contents, plan checklist state, branch state, and
> any PR facts all change between invocations. Re-gather everything in Step 1;
> never trust prior outputs from this conversation.

## Step 1: Gather live state

**Always available:**

- The plan file (from the latest `## Plan File Info:` `<system-reminder>`) and
  its checklist items — context for what was attempted, not the change record.
- `TaskList` — completed tasks often name the components changed.
- Conversation history (scanned in Step 1c).

### 1a. Version control — only when the cwd is a repository

Gate the whole step:

```bash
git rev-parse --is-inside-work-tree >/dev/null 2>&1
```

When it fails, skip every git source below, note the skip for the emitted
prompt's NOT GATHERED section, and continue on conversation evidence alone.
When it succeeds, collect:

1. Uncommitted and untracked work: `git status --porcelain`.
2. Branch commits relative to the remote-tracking upstream, when one exists:
   `git log --oneline '@{upstream}..HEAD'`. Empty output means nothing is
   committed ahead — normal, not an error; conversation SHAs (1c) still cover
   work committed directly to a synced default branch.
3. Diff shape against the same upstream: `git diff --stat '@{upstream}...HEAD'`.
4. Associated PRs: fetch candidates with
   `gh pr list --state all --limit 30 --json number,title,url,state,headRefName,headRefOid`
   and keep those whose `headRefOid` matches an inventoried commit SHA or whose
   `headRefName` matches a branch named in this conversation. Capture **full
   URLs**, never bare `#123`.

Record which git sources were skipped; each skip is declared in the emitted
prompt, never silently dropped.

### 1b. Union the commit sets

The inventory's commit set is the union of: upstream-diff commits (1a.2),
uncommitted/untracked files (1a.1), and any commit SHAs created during this
conversation. Verify each conversational SHA exists in `git log` before using
it; drop SHAs that do not resolve rather than guessing.

### 1c. Scan the conversation for what git cannot know

Walk the history in reverse chronological order, stopping when ~10 consecutive
messages yield nothing new. Extract, per change:

- **Rationale** — why the change was made (the "Why" line; PR bodies do not
  carry this — routing law keeps reasons out of public repositories).
- **Technical substance** — functions, configs, schemas, flags, or interfaces
  touched, beyond what filenames imply.
- **Changes git missed** — work described but never committed, reverted
  approaches (note them so the weak model does not document dead behavior),
  and follow-ups that alter how a change should be described.
- Errors fixed and workarounds applied, where they affect documented behavior.

## Step 2: Build the inventory

One entry per changed item — **every** item, no judgment-driven pruning. This
is the deliberate inverse of `update-docs`' "not every change needs
documentation": pruning is the consumer model's report job, not yours. If a
change seems trivial, include it anyway and let the routing rules send it
somewhere.

```text
N. <repo-relative path or component name>
   Changed: <what changed technically — functions, configs, schemas, CLI
            surface, API shape>
   Commits: <short SHAs> | uncommitted
   PR: <full URL> | none
   Why: <one line, from conversation evidence>
```

Include raw diff hunks only when they total roughly 40 lines or fewer;
otherwise carry the per-file stat summary and precise descriptions. Large raw
diffs overflow a weak model's useful context and produce hallucinated
summaries.

## Step 3: Route each item public or private

Apply these rules in order; first match wins:

1. **Private** — internal topology, hostnames, IPs, security findings, secret
   handling, credential flows, incident detail, internal identity or
   provisioning, anything operational-sensitive.
2. **Public** — user-visible behavior: installation, usage, command surface,
   public API/schema shapes, plugin capabilities, README/docs-facing changes.
3. **Ambiguous** — route private. When one item genuinely has both aspects,
   emit it twice — once per target — each entry scoped to that aspect only.

State the resolved target per item as `→ Update: public|private: <specific
doc file/section when known, else the doc area>`.

## Step 4: Emit the prompt

Print the artifact under a clear header. Fixed skeleton:

```text
# Documentation Update Prompt (generated <date>)

ROLE: You update documentation only. Never modify source code, configuration,
tests, CI workflows, or any non-documentation file.

CONTEXT: A development session changed the items below. Repository root:
<absolute path>. Bring the listed documentation targets up to date so they
match reality as described — nothing more.

CHANGE INVENTORY (complete — every item must appear in your final report):
<the Step 2 entries, each with its Step 3 "→ Update:" line>

RULES (treat as constraints):
- Documentation only. If an instruction seems to require a code change, skip
  the item and say so in the report.
- Match each doc's existing structure, tone, and formatting conventions.
  Read the target file before editing it.
- Write nothing you cannot ground in the inventory. When uncertain, skip the
  item and report why — never guess or fill gaps with plausible content.
- Reference PRs by full URL wherever the doc format supports links. Never a
  bare #123.
- Do not document reverted or abandoned approaches listed below.
  Abandoned: <list, or "none">

NOT GATHERED (re-derive these yourself if needed):
<each source skipped in Step 1, e.g. "no repository at cwd — commit and PR
facts absent", or "none">

OUTPUT REPORT (required):
For every inventory item, exactly one line:
  <item N>: updated (<files touched>) | skipped (<reason>)
Then: docs updated count, items skipped count.
```

The prompt is unbounded — exhaustiveness outranks brevity here. A weak model
fails from missing facts far more often than from long input.

## Related Skills

- **wrap-up** (this plugin) — end-of-session handler; run this alongside or
  after it when documentation needs to catch up.
- **handoff** (this plugin) — the smart-reader counterpart artifact builder;
  shares the self-contained-prompt discipline, inverts the compression.
- **session-status** (this plugin) — derivation engine whose Steps 1–2 this
  skill reuses for plan/task/history gathering.
- **update-docs** — executes documentation updates in-session with tech-writer
  agents; use instead of this skill when a premium model should do the writing.
- **track-followups** — routes doc-debt discovered while building the
  inventory into the tracker or incident system.
