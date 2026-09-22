# Substrate resilience detail

The spawn substrate (agent supervisor, tmux panes, `fork()`) is
infrastructure and fails in practice (observed: mid-run ENXIO fork failures
and a phantom spawn that returned an id but no output). Full contract:

- Probe before a fan-out: spawn one trivial agent and confirm real output.
- Bound concurrency to the skill's stated cap; never fire an unbounded batch.
- Treat "id returned but no output by a sane deadline" as a failed spawn.
- Declare the solo path: which steps the lead executes single-threaded when
  spawning is unavailable. Degrade to serial — never abort the mission or
  restart shared infrastructure that would kill the lead session mid-run.
- On spawn failure, re-probe with backoff; do not retry-loop spawns.
- Arm a recurring heartbeat (cron/monitor) re-invoking the lead every ~30 min
  (your call, never over 50 min — the prompt-cache ceiling). Each firing:
  check which executors owe reports, ground-truth-verify anything silent
  >45 min (silence isn't progress — watchers die silently, e.g. credential
  expiry), advance the critical path.
- Every subagent waiter/poller needs a bounded timeout (~30 min default, your
  call); on expiry it surfaces state to the lead instead of waiting longer.
  Poll loops re-mint short-lived credentials per attempt, never held across
  waits.
- A helper that prints a bare token (`... token read`) is captured with
  `VAR=$(...)`, never `eval`-ed. An `eval` echoes the value into the
  transcript; the immediate action is to revoke that token.
- A required check whose name is a prefixed form of an advisory one (`Merge
  Gate` vs `ci / Merge Gate`) is read from the repository's rulesets, not
  inferred from the check list on a pull request.

See the `subagent-resilience` rule (ai-assistant-instructions) for the
canonical, always-current version of this contract.
