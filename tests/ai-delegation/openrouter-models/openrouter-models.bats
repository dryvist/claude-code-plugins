#!/usr/bin/env bats
# Test suite for the openrouter-models skill rule text.
#
# Mirrors the repo checks for skill text: frontmatter presence, the
# 500-line hard limit from .github/workflows/validate-skills.yml, and
# grep assertions on standing rules (same style as
# tests/jpe-ai-delegation/delegation-ladder.bats).
#
# Run with: bats tests/ai-delegation/openrouter-models/openrouter-models.bats

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SKILL="$REPO_ROOT/ai-delegation/skills/openrouter-models/SKILL.md"
}

@test "frontmatter carries name and a non-empty description" {
  [ "$(head -n 1 "$SKILL")" = "---" ]
  run grep -c '^name: openrouter-models' "$SKILL"
  [ "$status" -eq 0 ]
  run grep -c '^description: .' "$SKILL"
  [ "$status" -eq 0 ]
}

@test "skill stays within the 500-line hard limit" {
  skill_lines="$(wc -l < "$SKILL")"
  [ "$skill_lines" -le 500 ]
}

@test "skill keeps prices, limits and promotions on the router entry and benchmarks in the dataset" {
  for rule in '## Single source' 'live only on the router model entry' 'benchmark results live only in the published dataset' 'every other place links' ; do
    run grep -F "$rule" "$SKILL"
    [ "$status" -eq 0 ]
  done
}
