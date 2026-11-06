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
  [ "$(jq -r '.kinds.code.rungs | map(.name) | join("|")' "$LADDER")" = 'Codex|zcode-job sandbox|Z.ai GLM|OpenCode Go|Haiku xhigh' ]
  [ "$(jq -r '.kinds.private.rungs | map(.gate) | join("|")' "$LADDER")" = 'codex|allowlisted|glm|opencode-go|always' ]
  [ "$(jq -r '.kinds.other.rungs | map(.name) | join("|")' "$LADDER")" = 'Codex|Z.ai GLM|OpenCode Go|Haiku xhigh' ]
  run grep -iE 'sonnet|opus|fable|litellm|small' "$LADDER"
  [ "$status" -eq 1 ]
}

@test "skill states Codex classes, safety gates, PR contract and last resort" {
  for rule in 'codex-quota' 'Never Terra above high, never Luna above max.' 'Luna `xhigh`' 'Luna `max`' 'Terra `medium`' 'Terra `high`' 'auth, secrets, router, memory and cluster' '[class: bulk-complex]' 'ai-untrusted-ok=true' 'payload classification' 'human:review' 'Leak-scan' 'Never auto-merge' 'Never Sonnet, Opus or Fable' 'Never send secrets, credentials, inventory or incident content'; do
    run grep -F "$rule" "$SKILL"
    [ "$status" -eq 0 ]
  done
}

@test "skill and reference no longer describe bypasses or retired routes" {
  run grep -iE 'Luna only|Never Terra[,.;]|GLM runs only inside|Explicit model choices.*pass through|isolated spawns go to Haiku|text-only router lanes|runs Codex and Haiku only' "$SKILL" "$REPO_ROOT/jpe-ai-delegation/skills/delegation-ladder/references/estate-routing.md"
  [ "$status" -eq 1 ]
}
