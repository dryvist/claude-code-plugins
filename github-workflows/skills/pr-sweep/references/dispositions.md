# Dispositions and the Round Loop

## Evidence per PR

Gather this read-only evidence before choosing a verdict. Rebuild it from fresh
state for each round.

- **GitHub:** canonical readiness gate, `createdAt`, last push and last comment
  time, author, linked tracker item, and any session id in the PR body or
  branch name. A session id has form `<runtime>-<host>-<8hex>`; a branch may
  use `feature/<issue>-<sid8>-<slug>`.
- **Local:** find clones under the workspace root:

  ```sh
  find "$GIT_HOME" -maxdepth 5 -type d -name "$REPO_NAME" -not -path "*/.worktrees/*"
  ```

  In each clone, read `git worktree list --porcelain` and
  `git for-each-ref "refs/heads/$HEAD_BRANCH"`. Compare the branch with the
  remote head using ahead/behind counts; record unpushed commits and dirty
  worktrees. Use the current remote head OID. If the required commit object is
  unavailable from read-only local state, record the comparison as unknown.
- **Sessions:** consult the runtime's session listing (e.g. ListAgents); match
  by session id, branch, or worktree path.
- **Supersession:** inspect `git cherry <base> <head>` (`-` means that patch
  is already upstream), the diff against the merge-base, and merged PRs that
  touch the same files or title.

Keep triage read-only. Do not push, comment, close, delete, or alter local refs
while gathering evidence.

## Liveness

A session is live if the session listing shows it, or its branch had a push or
comment in the last 24 hours, or its worktree has uncommitted changes. For a
dead owner, apply the session-coordination 24-hour steal rule: take over,
comment first, and use a new branch if commits are needed. Never push from a
branch another session owns.

## Hand-off with acknowledgement

1. Message the owning session with the PR URL, head OID, blocking item, and
   what done means.
2. Post the PR comment `handing off to <session-id>` as the transfer record.
3. Acknowledgement is a reply, or that session's own PR comment or push, within
   one cadence interval.
4. If there is no acknowledgement within two intervals, treat the owner as
   dead and take over under the liveness rule.
5. A cloud session that cannot reply acknowledges only by PR comment or push.

An unacknowledged hand-off is not a disposition. Keep it in the ledger with
the owning session, next action `await acknowledgement`, and its wake time.

## Closing safely

Post an evidence comment before closing. Name the evidence type and the commit
or PR that supports it:

```text
Closing as <superseded | merged-elsewhere | obsolete | empty>.
Evidence type: <empty diff | patch IDs already on base | superseded PR | removed target>.
Commit or PR: <commit SHA or PR URL> — <specific result>.
```

Delete the remote branch only after the close succeeds. Remove the matching
local branch or worktree through **prune-branches** (github-workflows). A dirty
worktree or unpushed commits block deletion; choose REVIVE or HANDOFF instead.

## Ownership ledger

Keep one line per stale PR in the sweep's state file:

```text
repo#N | verdict | owner | next action | wake condition
```

Rewrite the ledger each round from fresh state; never carry an old line
forward as evidence. Include validation or acknowledgement work in the next
action and its due time in the wake condition.

## Round loop and cadence

- Between rounds, use a scheduled wake-up (e.g. ScheduleWakeup). A detached
  background waiter does not wake the agent.
- Make the min-interval gate the first action of each round. Check a durable
  marker file; the default minimum interval is 30 minutes. Write the marker
  after the round so a crashed round is retried.
- Inside a round, wait on CI with an event-driven monitor.
- Pick the next interval from pending work: 30 minutes when hand-off
  acknowledgements or CI are due, up to 60 minutes when only human answers are
  pending.

The next round starts from a fresh open-PR query, including PRs that became
older than 24 hours while waiting. End only after Phase 5 validation, then
count stale open PRs again.

## Batched human asks

Once per round, send one message via the operator's notification channels
listing every ESCALATE item. Use the escalation paragraph format in
`sweep-mechanics.md`. Never re-send an unchanged ask; a new or changed item is
the only reason to ask again. Keep each unanswered item in the ledger with a
named owner, next action, and scheduled wake condition.
