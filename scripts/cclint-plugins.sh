#!/usr/bin/env bash
# Validate every plugin's SKILL.md / command / agent frontmatter against
# Anthropic's plugin validator using `cclint`. Mirrors the loop in
# .github/workflows/validate-plugin.yml so failures land at commit time, not
# only on CI.
#
# Pre-commit invokes this via `language: golang` with cclint listed as an
# `additional_dependencies` entry, so `cclint` is on PATH when the script runs.
# Outside pre-commit, install with: go install github.com/dotcommander/cclint@latest
set -euo pipefail

if ! command -v cclint >/dev/null 2>&1; then
  echo "cclint not on PATH. Install with: go install github.com/dotcommander/cclint@latest" >&2
  exit 1
fi

# Iterate every top-level directory that looks like a plugin (has plugin.json).
shopt -s nullglob
fail=0
for plugin_dir in */; do
  plugin_name="${plugin_dir%/}"
  plugin_json="${plugin_dir}.claude-plugin/plugin.json"
  [[ -f "${plugin_json}" ]] || continue

  # Skip hooks-only plugins (CI does the same): nothing for cclint to read.
  lintable=$(jq -r '(.skills//[])+(.commands//[])+(.agents//[])|length' "${plugin_json}" 2>/dev/null || echo 0)
  if [[ "${lintable}" -eq 0 ]]; then
    continue
  fi

  if ! cclint "${plugin_name}"; then
    fail=1
  fi
done

exit "${fail}"
