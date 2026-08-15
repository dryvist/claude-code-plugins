---
name: github-code-search
description: Search real code across ~1M public GitHub repositories via grep.app — use when you need to see how others already solved something before writing it, find real usage of an API or config key, check whether a pattern is idiomatic, or gather prior art for a design decision. Works through the `grep` MCP server or a keyless HTTP fallback.
license: Apache-2.0
metadata:
  version: 1.0.0
  author: dryvist homelab
  hermes:
    category: research
    tags:
      - search
      - github
      - prior-art
      - code-reuse
    related_skills:
      - native-first
---

# GitHub Code Search (grep.app)

Literal code search across roughly a million public GitHub repositories. This is
the fastest way to answer "has someone already done this?" — which is the question
that has to be answered before any custom code gets written.

## When to reach for it

- **Before writing anything custom.** `native-first` says find the existing solution
  first; this is how you look. A pattern with thousands of hits is idiomatic; a
  pattern with three is probably a mistake.
- **Real usage of an API, flag, or config key** the docs mention but do not show.
- **Prior art for a design decision** — how five projects structured the same thing.
- **Error strings and stack frames** — searching the literal message often lands on
  the upstream source that emits it.

Not for: searching *this* repo (use `Grep`), private code, or anything where the
query itself is sensitive. **The query string leaves the machine.** Never put a
hostname, credential, internal path, or customer name in a search.

## How it searches

grep.app matches **literal code**, not keywords. It is `grep` over a corpus, not a
search engine — there is no stemming, no synonyms, no ranking by intent. Search the
exact characters you expect to be in the file.

```text
good:  useOptimistic(          bad:  react optimistic update hook
good:  ANSIBLE_HOST_KEY_CHECKING       bad:  how to disable ansible host key checking
```

## Primary path — the `grep` MCP server

One tool: **`mcp__grep__searchGitHub`**.

| Param | Type | Notes |
| --- | --- | --- |
| `query` | string | **required** — the literal code to find |
| `language` | string[] | e.g. `["TypeScript","TSX"]`, `["Nix"]`, `["YAML"]` |
| `repo` | string | partial match — `vercel/` matches the whole org |
| `path` | string | partial match — `/flake.nix`, `/.github/workflows/` |
| `useRegexp` | bool | default `false`; prefix `(?s)` for multi-line patterns |
| `matchCase` | bool | default `false` |
| `matchWholeWords` | bool | default `false` — set it when a short identifier is a substring of everything |

The server is keyless and stateless, so there is no auth step and nothing to rotate.

## Fallback — keyless HTTP

For any harness without MCP, the same corpus is reachable over plain HTTP:

```bash
curl -s 'https://grep.app/api/search?q=fetchGitTree&l=Nix' \
  | jq -r '.hits.hits[] | "\(.repo.raw)  \(.path.raw)"' | head -20
```

Query params: `q` (required), `l` (language), `r` (repo), `regexp=true`.
Matched spans in returned content are wrapped in `»…«`.

## Working the query

1. **Start broad.** One distinctive token, no filters. Read the total count — a
   count in the tens of thousands means the query is too generic to be useful; a
   count of zero usually means a typo, not an absence.
2. **Then filter**, `language` before `repo`. Narrowing by language is almost always
   the single most effective cut.
3. **Read the hits, not the count.** Open two or three of the actual files. A high
   count across a hundred forks of the same repo is one data point, not a hundred.
4. **Prefer the smallest query that still discriminates.** Long literal strings match
   nothing; a single unusual identifier matches exactly the right files.

## Related Skills

- **native-first** (script-guards) — the discovery ladder this feeds; search before
  you write.
- **gh-cli-patterns** (this plugin) — for searching a *known* repo or org through
  the GitHub API rather than the public corpus.
