# content-guards

Content validation and guard hooks via PostToolUse.

See [ARCHITECTURE.md](ARCHITECTURE.md) for integration diagrams.

## Features

- **markdown-validator**: Validates markdown with markdownlint
- **token-validator**: Enforces configurable file token limits
- **no-real-ips**: Blocks non-allowed IPv4 literals in Write/Edit content; first-block, second-allow flow
- **webfetch-guard**: Blocks outdated year references in web queries
- **readme-validator**: Checks README files for required sections and badge health
- **issue-limiter**: Prevents GitHub issue backlog overflow with 24h rate limiting

## Usage

No manual invocation required. All hooks activate automatically:

- **token-validator** — blocks files exceeding token limits (PreToolUse: Write, Edit)
- **no-real-ips** — blocks IPv4 literals outside the allowlist
  (`192.168.0.0/24`, loopback, `0.0.0.0`, broadcast, link-local metadata).
  First attempt blocks with a clear warning; a retry within 5 minutes is
  treated as the agent's acknowledgment and allowed through (PreToolUse:
  Write, Edit). State persists in
  `$XDG_CACHE_HOME/content-guards/no-real-ips-state.json`.
- **webfetch-guard** — blocks outdated year references in web queries (PreToolUse: WebFetch, WebSearch)
- **issue-limiter** — rate limits `gh issue create` and `gh pr create` (PreToolUse: Bash)
- **branch-limiter** — limits concurrent open branches (PreToolUse: Bash)
- **markdown-validator** — runs markdownlint after writes (PostToolUse: Write, Edit)
- **readme-validator** — checks README required sections after writes (PostToolUse: Write, Edit)

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/content-guards
```

## Dependencies

- `jq` - JSON processing
- `atc` - Token counting tool
- `markdownlint-cli2` - Markdown linting
- `gh` - GitHub CLI

## Testing

Run tests using the shared test runner:

```bash
# From repository root
./scripts/run-tests.sh content-guards

# Alternative: run bats directly
bats tests/content-guards/**/*.bats
```

Test coverage includes:

- File type filtering (non-markdown, missing, dotfiles)
- Config resolution (project vs fallback)
- Cross-repo editing scenarios
- Unbound variable regression prevention (PR #39, #40)
- Issue/PR rate limiting and hard-limit blocking
- README required section and installation code block validation

## License

Apache-2.0
