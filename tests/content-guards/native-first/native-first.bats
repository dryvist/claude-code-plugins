#!/usr/bin/env bats
# Test suite for the native-first skill rule text.
#
# Mirrors the repo checks for skill text: frontmatter presence, the
# 500-line hard limit from .github/workflows/validate-skills.yml, and
# grep assertions on standing rules (same style as
# tests/jpe-ai-delegation/delegation-ladder.bats).
#
# Run with: bats tests/content-guards/native-first/native-first.bats

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SKILL="$REPO_ROOT/content-guards/skills/native-first/SKILL.md"
}

@test "frontmatter carries name and a non-empty description" {
  [ "$(head -n 1 "$SKILL")" = "---" ]
  run grep -c '^name: native-first' "$SKILL"
  [ "$status" -eq 0 ]
  run grep -c '^description: .' "$SKILL"
  [ "$status" -eq 0 ]
}

@test "skill stays within the 500-line hard limit" {
  skill_lines="$(wc -l < "$SKILL")"
  [ "$skill_lines" -le 500 ]
}

@test "skill ranks a repeated job native feature first, local agent second, never a script" {
  for rule in 'A repeated job is a native feature first and a local agent second' 'never a' 'new standing script' 'carries the tool'"'"'s instructions' 'the session only calls it'; do
    run grep -F "$rule" "$SKILL"
    [ "$status" -eq 0 ]
  done
}
