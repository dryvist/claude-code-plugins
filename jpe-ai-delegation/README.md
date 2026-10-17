# jpe-ai-delegation

This plugin is specific to the maintainer's own setup and is not intended for general use.

## Skills

- **`/delegation-ladder`** - Apply the maintainer's executor ladder, eligibility rules, and verification steps

## Hooks

- **Spawn router and permission judge** - Apply the maintainer-specific policy documented in the delegation-ladder references

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/jpe-ai-delegation
```

## Usage

```text
/delegation-ladder
```

Run `scripts/agent-route <kind> [--zcode available|exhausted]` from the
plugin root to print the first eligible executor. Add `scripts/` to `PATH`
to invoke it as `agent-route`; ZCode defaults to exhausted.
`AGENT_ROUTE_CODEX_QUOTA=available|exhausted` replaces the Codex quota check
for tests.

## License

MIT
