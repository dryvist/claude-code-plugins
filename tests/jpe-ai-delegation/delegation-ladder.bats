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

@test "ladder contains the exact binding order, eligibility gates and no prohibited models" {
  [ "$(jq -r '.kinds | keys | sort | join("|")' "$LADDER")" = 'code|other|private' ]
  [ "$(jq -r '.kinds.code.rungs | map(.name) | join("|")' "$LADDER")" = 'zcode-job sandbox|Codex|Z.ai GLM|OpenCode Go|Haiku xhigh' ]
  [ "$(jq -r '.kinds.private.rungs | map(.name) | join("|")' "$LADDER")" = 'Codex|Haiku xhigh' ]
  [ "$(jq -r '.kinds.other.rungs | map(.name) | join("|")' "$LADDER")" = 'Codex|Z.ai GLM|OpenCode Go|Haiku xhigh' ]
  run grep -iE 'sonnet|opus|fable|litellm|small|terra' "$LADDER"
  [ "$status" -eq 1 ]
}

@test "skill states the first step, sensitivity split, quota spending, gates and last resort" {
  for rule in 'codex-quota' 'quick, checkable tasks' 'router local default or medium capability before any subscription' 'escalate only after a checked failure' 'equal first choices' 'split by sensitivity' 'obvious, definitely non-sensitive' 'public repos' 'coding-adjacent only' 'GitHub automation and workflows' 'internet-open container' 'anything even remotely sensitive' 'or any private repo' 'Luna `xhigh` default' '`max` as needed' 'more than 5% left' 'Never Terra' '[class: bulk-complex]' 'more quota headroom' 'ZCode 5-hour and weekly' 'OpenCode Go monthly' 'Codex weekly' 'Public work only' 'at or under its pace for the billing period' 'Haiku `xhigh`, the last resort' 'before the orchestrator works solo' 'human:review' 'Leak-scan' 'Never auto-merge' 'Never Sonnet, Opus or Fable' 'Never send secrets, credentials, inventory or incident content' 'second-opinion reviewer'; do
    run grep -F "$rule" "$SKILL"
    [ "$status" -eq 0 ]
  done
}

@test "skill and reference no longer describe bypasses or retired routes" {
  run grep -iE 'Luna only|Never Terra above|ai-untrusted-ok|classified-safe|payload classification|Terra `(medium|high)`|GLM runs only inside|Explicit model choices.*pass through|isolated spawns go to Haiku|text-only router lanes|runs Codex and Haiku only' "$SKILL" "$REPO_ROOT/jpe-ai-delegation/skills/delegation-ladder/references/estate-routing.md"
  [ "$status" -eq 1 ]
}
