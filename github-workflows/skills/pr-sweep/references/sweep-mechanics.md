# Sweep Mechanics

Diagnosis and orchestration detail for `/pr-sweep`. Load when running a sweep
that spans more than a couple of PRs. Command shapes come from
**gh-cli-patterns**; nothing here restates them.

## Part 1 — Triage mechanics

### Merge state is computed lazily

`mergeable` and `mergeStateStatus` return `UNKNOWN` on a first query. The
query itself triggers computation; a second query returns the truth. Classify
on the second read. A single pass mis-buckets PRs and sends workers to repair
things that were never broken.

### `UNSTABLE` is not `BLOCKED`

They are different problems and want different responses.

| State | Means | Response |
| --- | --- | --- |
| `CLEAN` | Nothing outstanding | MERGE candidate |
| `UNSTABLE` | A non-required check is red; the merge is still permitted | Judgment: is the red check meaningful to this change? |
| `BLOCKED` | A branch rule is unsatisfied | Read the branch ruleset to learn *which* rule |
| `DIRTY` | Conflicts | FIX or HOLD |

The most common false hold: a repo with zero required approvals but
thread-resolution required, `BLOCKED` purely by unresolved review threads —
frequently opened by a review bot. That is a **FIX**, not a HOLD. Check thread
authorship first: many repos run automation that resolves bot threads on the
next push, so triggering that is cheaper and safer than resolving by hand.
Resolve a thread because you addressed it, never to clear a gate.

### Status rollups go stale

A PR showing a failed check may already have been fixed by a later commit.
Re-read current status before doing any repair work. Sending an agent to fix
an already-fixed problem is a common and expensive miss.

### Correlated failures mean the base is broken

If two or more independent PRs fail the **same** set of checks, suspect the
base branch, not the PRs.

1. Prove it: run the workflow against the base branch itself, with no PR
   involved. If it fails there, the PRs are inheriting it.
2. Decide per PR on that evidence. A PR whose own new tests pass and whose
   files do not touch the failing area is usually still safe.
3. Verify afterwards by comparing failing **sets**, not red-versus-green. The
   question is "did the set shrink from 7 to 6", never "is it green".
4. Emit **one repo-level finding**, not N identical per-PR holds.

### Repo-wide gates block their own fix

Some checks scan the whole tree rather than the diff. One violating file then
fails every PR in the repo — including the PR that fixes it. This inverts the
normal order:

- The fix lands **first**, in its own small PR, before anything else can go
  green.
- Compute headroom against what in-flight PRs will add, not just current
  state. A fix that lands exactly at the limit re-breaks on the next append.
- Never satisfy the gate by adding the file to an ignore list. If the project
  has already made that exclusion somewhere authoritative, duplicating it
  locally is both a suppression and a second source of truth.

### Merged content can fail what neither side fails

A promotion or long-lived branch can trip a per-file limit that **both**
branches pass individually, because both edited the same file. Measure the
**merged** content, not either side. Reproduce locally with a no-commit merge
before concluding anything.

### Infrastructure failure has a signature

Learn it — it is the one case where re-running is correct rather than
merging around a red check:

- Job conclusion is `failure`, but **zero steps** are marked failed.
- The key step's conclusion is `null` — it never reported.
- Log retrieval 404s (the log blob does not exist).
- Often several jobs die at once, on different runners.

That is a lost or killed runner. Re-run the failed jobs. Corroborate
mechanically first: do the failing jobs even touch the changed code? If they
do not, and the one job that *does* exercise it passed, the case is strong.
Never merge around a red check on a hunch — either it re-runs green, or it
holds.

Capacity is finite: launching many merges at once can itself take runners
down. That is what the global merge budget prevents.

### Post-merge verification

- **Wait** for merge-triggered CI before declaring anything clean. Checking
  too early reads pre-merge runs and proves nothing.
- Attribute every red by **timestamp against merge time**. Reds that predate
  the sweep are not the sweep's.
- A job that fails while its downstream publish step merely *skips* produces
  no visible signal. Surface it as a finding rather than letting it pass.

## Part 2 — Parallel protocol

### Worker report schema (Phase 1 → lead)

Per repo, one block:

```text
repo: <name>   default-branch: <name>   open: <count>
PRs:
  <#N> <verdict> — <title> | <state> | +<a>/-<d> f=<files> | <reason or question>
repo-findings:
  <broken base | repo-wide gate + required order | infra failure | none>
```

Verdicts are `MERGE` / `FIX` / `HOLD(reason)` / `ESCALATE(question)`. Nothing
in this block authorizes a write.

### Execution order schema (Phase 2 → workers)

```text
repo: <name>
  merge: <#N> head=<OID> [after:<#M>]
  fix:   <#N> head=<OID>
  hold:  <#N> — <reason>
```

The `head` OID is the safety mechanism. At merge time the worker re-reads the
head and aborts that item if it moved — someone pushed, and the triage that
justified the merge is stale. Void items return to triage; they are never
merged on the old evidence.

**Why this exists:** an approval sent as advice can be raced. A worker that
merges while the lead's decision is still in flight forces a fix-forward
follow-up. The phase boundary gates the write itself, so the race cannot
happen rather than being discouraged.

### Concurrency

- One worker per repo; cap concurrent workers (default 4).
- Within a repo, merges are strictly serial.
- A global merge budget (default 2–3) caps concurrent merge-triggered CI
  across all repos.
- Where the credential or locking model is per-repo, within-repo
  serialization is already forced; keep it regardless, because it also bounds
  blast radius.

### Working with workers

- **Reuse context.** Continue the triage worker into execution by message
  rather than spawning a fresh agent. The diagnosis it already did is the
  context the fix needs.
- **Probe before a wide fan-out**, and have a serial fallback: spawning is
  infrastructure and can fail mid-run.
- **Poll nothing.** Use event-driven monitors for CI completion, and batch
  status queries for many PRs into a single loop.
- **Require primary sources.** Delegates misattribute claims ("you said X")
  and will propose a banned shortcut with a persuasive justification. Ask
  where a load-bearing fact came from, and expect to say no.
- **Read summarizing diffs line by line.** A delegate condensing a rules or
  instructions file can silently invert a default — turning "most changes
  require this" into "when needed". Size and token checks do not catch
  semantic drift; only reading does.
- **Batch judgment calls.** Collect low-confidence decisions into one
  escalation round instead of interrupting per PR.

### Escalation paragraph format

One per PR, no diffs:

```text
<repo#N> — <title>. <+a/-d, f files>, <state>, <checks>. <One line on what
makes it uncertain.> Question: <specific yes/no>.
```
