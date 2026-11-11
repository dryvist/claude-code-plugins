#!/usr/bin/env bats
# Test suite for the premium-agent-orchestration skill rule text.
#
# Mirrors the repo checks for skill text: frontmatter presence, the
# 500-line hard limit from .github/workflows/validate-skills.yml, and
# grep assertions on standing rules (same style as
# tests/jpe-ai-delegation/delegation-ladder.bats).
#
# Run with: bats tests/ai-delegation/premium-agent-orchestration/premium-agent-orchestration.bats

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SKILL="$REPO_ROOT/ai-delegation/skills/premium-agent-orchestration/SKILL.md"
}

@test "frontmatter carries name and a non-empty description" {
  [ "$(head -n 1 "$SKILL")" = "---" ]
  run grep -c '^name: premium-agent-orchestration' "$SKILL"
  [ "$status" -eq 0 ]
  run grep -c '^description: .' "$SKILL"
  [ "$status" -eq 0 ]
}

@test "skill stays within the 500-line hard limit" {
  skill_lines="$(wc -l < "$SKILL")"
  [ "$skill_lines" -le 500 ]
}

@test "skill states the one-agent-per-tool call contract" {
  for rule in 'One agent per tool' 'call this' 'with these inputs and expect this output' 'runs on a local' 'carries the tool'"'"'s instructions, so no other context does'; do
    run grep -F "$rule" "$SKILL"
    [ "$status" -eq 0 ]
  done
}
