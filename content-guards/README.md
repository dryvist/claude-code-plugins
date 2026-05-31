# content-guards

Content validation and guard hooks via PostToolUse.

See [ARCHITECTURE.md](ARCHITECTURE.md) for integration diagrams.

## Features

- **markdown-validator**: Validates markdown with markdownlint
- **token-validator**: Enforces configurable file token limits
- **webfetch-guard**: Blocks outdated year references in web queries
- **secret-guard**: Blocks hardcoded sensitive homelab values (real IPs/domain) in writes
- **readme-validator**: Checks README files for required sections and badge health
- **issue-limiter**: Prevents GitHub issue backlog overflow with 24h rate limiting

## Usage

No manual invocation required. All hooks activate automatically:

- **token-validator** — blocks files exceeding token limits (PreToolUse: Write, Edit)
- **webfetch-guard** — blocks outdated year references in web queries (PreToolUse: WebFetch, WebSearch)
- **secret-guard** — blocks hardcoded sensitive homelab values (PreToolUse: Write, Edit, MultiEdit, NotebookEdit)
- **issue-limiter** — rate limits `gh issue create` and `gh pr create` (PreToolUse: Bash)
- **branch-limiter** — limits concurrent open branches (PreToolUse: Bash)
- **markdown-validator** — runs markdownlint after writes (PostToolUse: Write, Edit)
- **readme-validator** — checks README required sections after writes (PostToolUse: Write, Edit)

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/content-guards
```

## secret-guard

Blocks hardcoded sensitive homelab values from being written into a repo. Fires
on every `Write`, `Edit`, `MultiEdit`, and `NotebookEdit`, inspecting the
content field (`content`, `new_string`, `edits[].new_string`, or `new_source`).
Two detection prongs:

- **Literal** — a private, newline-separated POSIX-ERE denylist
  (`SENSITIVE_DENYLIST`) loaded from the macOS auto-readable keychain via
  `security find-generic-password -s SENSITIVE_DENYLIST -w`. Holds the exact
  real domain, node names, pool names, and account ID. Never committed; the hook
  only references it by name.
- **Structural (value-free)** — RFC1918 internal IP literals (`10.`,
  `192.168.`, `172.16-31.`). Fake test values (RFC2544 `198.18`/`198.19`,
  `example.invalid`) are allowlisted so fixtures and docs never trip the guard.
  A real-domain shape is also supported but **off by default** (it fires on
  every write; a broad TLD match would be hostile) — opt in per repo via
  `SECRET_GUARD_DOMAIN_REGEX`. The real domain is otherwise caught by the
  literal prong.

On a match it returns a `deny` decision naming the matched **category** (never
the value), instructing the agent to parameterize via Doppler/SOPS. The hook is
**fail-open**: a missing/empty denylist, an unreadable keychain, or any internal
error allows the write with a one-line stderr warning, so fresh clones and
external contributors are never blocked. The structural prong still runs when
the literal denylist is unavailable.

Environment overrides (testing only):

- `SENSITIVE_DENYLIST_KEYCHAIN_SERVICE` — read a different keychain service.
- `SECRET_GUARD_DOMAIN_REGEX` — enable/override the structural domain shape.

## Dependencies

- `jq` - JSON processing
- `atc` - Token counting tool
- `markdownlint-cli2` - Markdown linting
- `gh` - GitHub CLI
- `security` - macOS keychain access (secret-guard literal denylist; fail-open if absent)

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
- secret-guard structural IP-shape detection, RFC2544/example.invalid allowlisting, and fail-open behavior (fake values only)

## License

Apache-2.0
