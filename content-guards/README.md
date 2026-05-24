# content-guards

Content validation and guard hooks via PostToolUse.

See [ARCHITECTURE.md](ARCHITECTURE.md) for integration diagrams.

## Features

- **markdown-validator**: Validates markdown with markdownlint
- **token-validator**: Enforces configurable file token limits
- **sensitive-content-guard**: Blocks 7 categories of sensitive literals
  (IPv4, IPv6, emails, user paths, private keys, AWS account IDs, real
  domains) in Write/Edit content; first-block, second-allow flow per detector
- **webfetch-guard**: Blocks outdated year references in web queries
- **readme-validator**: Checks README files for required sections and badge health
- **issue-limiter**: Prevents GitHub issue backlog overflow with 24h rate limiting

## Usage

No manual invocation required. All hooks activate automatically:

- **token-validator** — blocks files exceeding token limits (PreToolUse: Write, Edit)
- **sensitive-content-guard** — blocks 7 categories of sensitive literals
  in Write/Edit content (PreToolUse: Write, Edit). First attempt blocks
  with a per-detector hint; a retry within 5 minutes for the same
  `(file, detector, value)` is treated as the agent's acknowledgment and
  allowed through. State persists in
  `$XDG_CACHE_HOME/content-guards/sensitive-content-state.json`.

  Detectors and their allowlist anchors:
  - **`ipv4`** — IPv4 outside `192.168.0.0/24`, loopback, `0.0.0.0`,
    broadcast (`255.255.255.x`), link-local metadata (`169.254.169.254`).
  - **`ipv6`** — IPv6 outside `::`/`::1`, `fe80::*` (link-local),
    `fc00::/7` (ULA), `2001:db8::*` (RFC 3849 doc prefix), `ff00::*`
    (multicast).
  - **`email`** — real email addresses outside `noreply@github.com`,
    `*@users.noreply.github.com`, `*@example.{com,org,net,local}`,
    `*@test`, `*@localhost`, and `<placeholder@…>` shapes.
  - **`absolute_user_path`** — hard-coded `/Users/<name>/` or
    `/home/<name>/` outside `${USER}`, `$USER`, or `<user>` placeholder
    shapes.
  - **`private_key_header`** — PEM private key markers
    (`-----BEGIN … PRIVATE KEY-----`); always blocked.
  - **`aws_account_id`** — bare 12-digit numbers on lines mentioning
    `account_id`, `arn:aws:`, `aws_account_id`, or `:account:`; allows
    `123456789012` (AWS's documented sample) and repeated-digit shapes.
  - **`real_domain`** — only flags tokens whose TLD is in a focused
    allowlist of ~29 popular public TLDs (`com`, `net`, `org`, `io`,
    `ai`, `dev`, `app`, `co`, `cloud`, `gov`, `edu`, etc. — see
    `REAL_TLDS` in the script). Anything outside that set
    (filenames like `foo.py`, version strings) is left alone.
    Also allows `*.example.*`, `*.test`, `*.localhost`, `*.invalid`,
    `*.local`, and the project's short explicit allowlist
    (`github.com`, `api.github.com`, `raw.githubusercontent.com`,
    `docs.jacobpevans.com`, `runs-on.com`, `healthchecks.io`).
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
