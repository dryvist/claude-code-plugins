# git-guards

Git security and workflow protection via PreToolUse hooks.

See [ARCHITECTURE.md](ARCHITECTURE.md) for integration diagrams.

## Features

- **git-permission-guard**: Blocks dangerous git/gh commands (force push, hard reset, destructive operations)
- **main-branch-guard**: Prevents file edits on main branch (enforces worktree workflow)
- **commit-trailer-guard**: Rewrites `Assisted-by: Claude <...>` to kernel coding-assistants format (`Assisted-by: Claude:<model>`)

## Usage

No manual invocation required. All hooks activate automatically:

- **worktree-reminder** — fires on every user prompt, reminds if not in a worktree
- **git-permission-guard** — fires on every Bash call, blocks dangerous git/gh commands
- **commit-trailer-guard** — fires on every Bash call, rewrites `Assisted-by` trailer in `git commit` commands to the [Linux kernel coding-assistants spec](https://docs.kernel.org/process/coding-assistants.html)
- **main-branch-guard** — fires on every file edit, blocks edits on main branch

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/git-guards
```

## License

Apache-2.0
