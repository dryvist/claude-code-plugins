---
name: native-first
description: "Stack-agnostic discovery playbook for finding the native, non-custom way to do something before writing any script or wrapper. Use when tempted to write a shell/python/glue script, add a dependency, or build a custom helper — and whenever a script-guards hook blocks a script write. Climbs a fixed ladder (tool's own config/flag/module, native platform feature, official docs via Context7, package registry, issue tracker) and ends with a hard rule: if no native path exists, output the evidence you checked, never a silent script fallback."
---

# Native-First

Find the way something is *meant* to be done before building a custom way. Most
"I need a script" moments have a native answer that is smaller, already tested,
and maintained by someone else. This skill is the search for that answer.

It pairs with the `script-guards` hooks. The hooks **block** an unnecessary
script; this skill **supplies the native path** that makes the block irrelevant.
`ponytail` decides *what rung* to reach for; native-first does the *research* that
rung needs when the answer is not already in front of you.

## When to use

- You are about to write a shell/python/glue script or a custom helper function.
- You are about to add a dependency for something small.
- A `script-guards` hook just blocked a script write. Do not route around it —
  run this ladder instead.
- You catch yourself thinking "there's probably a flag for this, but it's faster
  to just script it." That thought is the trigger.

## The ladder — stop at the first rung that holds

Climb in order. Each rung is cheaper to maintain than the one below it.

1. **The tool's own config, flag, or built-in module.**
   The single most-skipped rung. Check `--help`, `man <tool>`, `tldr <tool>`, and
   the tool's config-file reference before anything else. A `--format`, a config
   key, a built-in subcommand, or a stdlib module usually exists.
   *Examples:* `jq`/`--json` output instead of parsing text with `awk`;
   `git config` instead of editing `.git/config`; a language's stdlib
   (`pathlib`, `datetime`) instead of shelling out.

2. **A native platform feature.**
   The OS, runtime, or data layer often does it declaratively.
   *Examples:* a `launchd`/`systemd` unit instead of a cron-and-pidfile script;
   a database `CHECK`/`UNIQUE` constraint instead of app-side validation; CSS
   instead of JS; an HTML input type instead of a date-picker library.

3. **Official docs — via Context7 MCP, not memory.**
   Look up the current, versioned docs for the tool or library. Memory is stale;
   APIs move. Use the Context7 MCP (`resolve-library-id` then `query-docs`) or the
   vendor's own docs site. Never assert an API exists from recall — verify it.

4. **A package/module registry.**
   Someone published the thing. Search the ecosystem registry before writing glue:
   Ansible Galaxy (a role/collection/module), Terraform Registry (a provider/
   module), nixpkgs (a package/option), the language package index. A maintained
   module beats a bespoke script.

5. **The issue tracker.**
   Ask the source: search the tool's GitHub issues/discussions for
   "how do I do X natively" or "is X supported". The answer — including "not
   supported, here's the workaround" — is often already written down.

## Ordering rule: supported before bespoke

When more than one native path exists, prefer in this order:

**vendor-supported → community-supported → bespoke.**

A first-party feature outranks a popular plugin, which outranks anything you write.

## Terminal rule — no silent script fallback

If you climb the whole ladder and find no native path, the output is **not** a
script by default. The output is an **evidenced conclusion**:

> "No native path exists. I checked: `<tool> --help` (no relevant flag), the
> `<platform>` feature set (nothing declarative for this), Context7 docs for
> `<library>` vX (no API), the `<registry>` (no module), and issue `#<n>`
> (maintainer confirms unsupported). A small script is the remaining option —
> here it is, scoped to just this gap."

Only after that evidence is a custom script the right call. A script written
*without* that evidence is the thing this skill and the `script-guards` hooks
exist to stop. "I couldn't find one" is not evidence; "I checked these five
places and here is what each returned" is.

## Applying it

Report which rung the answer came from, so the next reader learns the native path
too: *"Used the tool's own `--output json` flag (rung 1)."* When you reach the
terminal rule, list the rungs checked and what each returned — that list is the
justification the script needs to exist.

## Related

- **script-guards hooks** (this plugin) — block unnecessary script writes; this
  skill supplies the native alternative they assume exists.
- **native-first is stack-agnostic** — it is not Nix-specific. On a Nix machine,
  a repo's `nix-tool-policy` rule adds the Nix-specific rungs on top of this ladder.
