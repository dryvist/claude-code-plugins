#!/usr/bin/env bats

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  SKILL="$REPO_ROOT/jpe-ai-delegation/skills/delegation-ladder/SKILL.md"
  LADDER="$REPO_ROOT/jpe-ai-delegation/skills/delegation-ladder/ladder.json"
}

@test "ladder data matches the delegation-ladder table" {
  markdown_ladders="$(awk -F '|' '
    /^\| `[^`]+` \|/ {
      kind=$2
      gsub(/[ `]/, "", kind)
      ladder=$3
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", ladder)
      gsub(/ -> /, "|", ladder)
      print kind "|" ladder
    }
  ' "$SKILL" | sort)"
  data_ladders="$(jq -r '.kinds | to_entries[] | [.key, ([.value.rungs[].name] | join("|"))] | join("|")' "$LADDER" | sort)"

  [ "$markdown_ladders" = "$data_ladders" ]
}
