#!/usr/bin/env bats
# Test suite for content-guards/scripts/enforce-issue-limits.py
#
# Tests command matching, rate-limit logic, hard-limit blocking, and CWD extraction.
# Mocks `gh` via a fake executable placed earlier in PATH.
#
# Run with: bats tests/content-guards/enforce-issue-limits/enforce-issue-limits.bats

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/content-guards/scripts/enforce-issue-limits.py"
  FAKE_GH_DIR="$(mktemp -d)"

  if [[ ! -f "$SCRIPT" ]]; then
    echo "ERROR: Script not found at $SCRIPT" >&2
    return 1
  fi

  # Write a configurable fake `gh` script. Tests set GH_RESPONSE and
  # GH_EXIT_CODE before calling the script under test.
  # GH_RESPONSE_ALL overrides the response when --state all is present
  # (used to simulate different open vs all-state counts for rate limit tests).
  cat > "$FAKE_GH_DIR/gh" <<'EOF'
#!/usr/bin/env bash
if [[ -n "${GH_RESPONSE_ALL:-}" ]] && [[ "$*" == *"--state all"* ]]; then
  echo "$GH_RESPONSE_ALL"
else
  echo "${GH_RESPONSE:-[]}"
fi
exit "${GH_EXIT_CODE:-0}"
EOF
  chmod +x "$FAKE_GH_DIR/gh"

  export PATH="$FAKE_GH_DIR:$PATH"
  export FAKE_GH_DIR
}

teardown() {
  rm -rf "$FAKE_GH_DIR"
}

# Helper: get current UTC time as ISO 8601
utc_now() {
  python3 -c 'from datetime import datetime, timezone; print(datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))'
}

# Helper: build a JSON array with __N__ substituted for the item number
build_json_array() {
  local template="$1" count="$2"
  local arr="[" i
  for i in $(seq 1 "$count"); do
    arr+="${template//__N__/$i}"
    [[ $i -lt "$count" ]] && arr+=","
  done
  arr+="]"
  echo "$arr"
}

# Helper: run the hook with the given JSON input, capturing exit status and stderr
run_hook() {
  run python3 "$SCRIPT" <<< "$1"
}

# ---------------------------------------------------------------------------
# TC1: Unrelated commands pass through immediately (exit 0)
# ---------------------------------------------------------------------------

@test "TC1: unrelated gh command is allowed" {
  run_hook '{"tool_input":{"command":"gh repo view"}}'
  [ "$status" -eq 0 ]
}

@test "TC1b: empty command is allowed" {
  run_hook '{"tool_input":{"command":""}}'
  [ "$status" -eq 0 ]
}

@test "TC1c: invalid JSON input is allowed" {
  run python3 "$SCRIPT" <<< "not json"
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# TC2: gh issue create - well under all limits (exit 0)
# ---------------------------------------------------------------------------

@test "TC2: gh issue create allowed when well under all limits" {
  # Few open issues, none AI-created, no recent activity
  export GH_RESPONSE='[{"number":1,"labels":[],"createdAt":"2020-01-01T00:00:00Z"}]'
  run_hook '{"tool_input":{"command":"gh issue create --title test"}}'
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# TC3: gh issue create - total issue hard limit (exit 2)
# ---------------------------------------------------------------------------

@test "TC3: gh issue create blocked when total open issues >= 100" {
  export GH_RESPONSE="$(build_json_array '{"number":__N__,"labels":[]}' 100)"

  run_hook '{"tool_input":{"command":"gh issue create --title test"}}'
  [ "$status" -eq 2 ]
  [[ "$output" =~ "BLOCKED: Issue creation limit exceeded" ]]
  [[ "$output" =~ "100/100" ]]
}

# ---------------------------------------------------------------------------
# TC4: gh issue create - AI-created issue hard limit (exit 2)
# ---------------------------------------------------------------------------

@test "TC4: gh issue create blocked when ai-created issues >= 25" {
  export GH_RESPONSE="$(build_json_array '{"number":__N__,"labels":[{"name":"ai-created"}]}' 25)"

  run_hook '{"tool_input":{"command":"gh issue create --title test"}}'
  [ "$status" -eq 2 ]
  [[ "$output" =~ "BLOCKED: Issue creation limit exceeded" ]]
  [[ "$output" =~ "25/25" ]]
}

# ---------------------------------------------------------------------------
# TC5: gh issue create - 24h rate limit (exit 2)
# ---------------------------------------------------------------------------

@test "TC5: gh issue create blocked when 50 issues created in last 24h" {
  local now
  now="$(utc_now)"
  export GH_RESPONSE="$(build_json_array '{"number":__N__,"labels":[],"createdAt":"'"$now"'"}' 50)"

  run_hook '{"tool_input":{"command":"gh issue create --title test"}}'
  [ "$status" -eq 2 ]
  [[ "$output" =~ "BLOCKED: Rate limit exceeded" ]]
  [[ "$output" =~ "Issues" ]]
}

# ---------------------------------------------------------------------------
# TC6: gh pr create - 24h rate limit (exit 2)
# ---------------------------------------------------------------------------

@test "TC6: gh pr create blocked when 50 PRs created in last 24h" {
  local now
  now="$(utc_now)"
  # Open PRs under hard limit (14 < 15), but 50 total created in 24h (rate limit)
  export GH_RESPONSE="$(build_json_array '{"number":__N__,"labels":[],"createdAt":"'"$now"'"}' 14)"
  export GH_RESPONSE_ALL="$(build_json_array '{"createdAt":"'"$now"'"}' 50)"

  run_hook '{"tool_input":{"command":"gh pr create --title test"}}'
  [ "$status" -eq 2 ]
  [[ "$output" =~ "BLOCKED: Rate limit exceeded" ]]
  [[ "$output" =~ "PRs" ]]
}

# ---------------------------------------------------------------------------
# TC7: gh pr edit - always allowed (edits don't create new PRs)
# ---------------------------------------------------------------------------

@test "TC7: gh pr edit is always allowed" {
  local now
  now="$(utc_now)"
  # Even at the rate limit ceiling, edit should pass
  export GH_RESPONSE="$(build_json_array '{"createdAt":"'"$now"'"}' 50)"

  run_hook '{"tool_input":{"command":"gh pr edit 42 --title new-title"}}'
  [ "$status" -eq 0 ]
}

@test "TC7b: gh pr edit with --body is always allowed" {
  local now
  now="$(utc_now)"
  export GH_RESPONSE="$(build_json_array '{"createdAt":"'"$now"'"}' 50)"

  run_hook '{"tool_input":{"command":"gh pr edit 126 --body \"updated description\""}}'
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# TC8: gh pr create - under limit is allowed
# ---------------------------------------------------------------------------

@test "TC8: gh pr create allowed when under rate limit" {
  local now
  now="$(utc_now)"
  export GH_RESPONSE='[{"createdAt":"'"$now"'"}]'

  run_hook '{"tool_input":{"command":"gh pr create --title test"}}'
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# TC9: gh failure - fail open
# ---------------------------------------------------------------------------

@test "TC9: gh failure causes fail-open (exit 0)" {
  export GH_EXIT_CODE=1
  export GH_RESPONSE=""

  run_hook '{"tool_input":{"command":"gh issue create --title test"}}'
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# TC10: block message includes correct remediation language (no bad references)
# ---------------------------------------------------------------------------

@test "TC10: hard-limit block message does not reference missing skill path" {
  export GH_RESPONSE="$(build_json_array '{"number":__N__,"labels":[]}' 100)"

  run_hook '{"tool_input":{"command":"gh issue create --title test"}}'
  [ "$status" -eq 2 ]
  [[ ! "$output" =~ "agentsmd/skills/consolidate-issues" ]]
}

# ---------------------------------------------------------------------------
# TC11: gh pr create - duplicate PR detection (exit 2)
# ---------------------------------------------------------------------------

@test "TC11: gh pr create blocked when duplicate open PR exists" {
  export GH_RESPONSE='[{"title":"docs: fix stale references","number":42}]'

  run_hook '{"tool_input":{"command":"gh pr create --title \"docs: fix stale references\""}}'
  [ "$status" -eq 2 ]
  [[ "$output" =~ "BLOCKED: Duplicate PR detected" ]]
  [[ "$output" =~ "#42" ]]
}

# ---------------------------------------------------------------------------
# TC12: gh pr create - different title allowed (exit 0)
# ---------------------------------------------------------------------------

@test "TC12: gh pr create allowed when no duplicate PR" {
  export GH_RESPONSE='[{"title":"docs: fix stale references","number":42,"createdAt":"2020-01-01T00:00:00Z"}]'

  run_hook '{"tool_input":{"command":"gh pr create --title \"feat: add new feature\""}}'
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# TC13: gh pr create - no title flag passes through (exit 0)
# ---------------------------------------------------------------------------

@test "TC13: gh pr create without --title flag is allowed" {
  export GH_RESPONSE='[{"title":"docs: fix stale references","number":42,"createdAt":"2020-01-01T00:00:00Z"}]'

  run_hook '{"tool_input":{"command":"gh pr create --body something"}}'
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# TC14: gh issue create - duplicate issue detection (exit 2)
# ---------------------------------------------------------------------------

@test "TC14: gh issue create blocked when duplicate open issue exists" {
  export GH_RESPONSE='[{"title":"chore: update dependencies","number":10,"labels":[]}]'

  run_hook '{"tool_input":{"command":"gh issue create --title \"chore: update dependencies\""}}'
  [ "$status" -eq 2 ]
  [[ "$output" =~ "BLOCKED: Duplicate Issue detected" ]]
  [[ "$output" =~ "#10" ]]
}

# ---------------------------------------------------------------------------
# TC15: gh issue create - different title allowed (exit 0)
# ---------------------------------------------------------------------------

@test "TC15: gh issue create allowed when no duplicate issue" {
  export GH_RESPONSE='[{"title":"chore: update dependencies","number":10,"labels":[],"createdAt":"2020-01-01T00:00:00Z"}]'

  run_hook '{"tool_input":{"command":"gh issue create --title \"fix: broken login\""}}'
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# TC16: CWD extraction - cd prefix extracts correct directory
# ---------------------------------------------------------------------------

@test "TC16: cd prefix extracts target repo directory" {
  # Use _extract_repo_dir directly via Python
  # Create a temp directory to act as the target repo path
  local fake_repo
  fake_repo="$(mktemp -d)"
  run python3 -c "
import importlib.util, sys
spec = importlib.util.spec_from_file_location('m', '$SCRIPT')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
result = mod._extract_repo_dir('cd $fake_repo && gh pr create --title test')
assert result == '$fake_repo', f'Expected $fake_repo, got {result}'
print('PASS')
"
  rm -rf "$fake_repo"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "PASS" ]]
}

@test "TC16b: cd prefix with quoted path extracts correctly" {
  # Create a temp directory with a space in the name
  local temp_base
  temp_base="$(mktemp -d)"
  local fake_repo="$temp_base/nix ai/main"
  mkdir -p "$fake_repo"
  run python3 -c "
import importlib.util, sys
spec = importlib.util.spec_from_file_location('m', '$SCRIPT')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
result = mod._extract_repo_dir('cd \"$fake_repo\" && gh pr create --title test')
assert result == '$fake_repo', f'Got {result}'
print('PASS')
"
  rm -rf "$temp_base"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "PASS" ]]
}

@test "TC16c: command without cd returns None" {
  run python3 -c "
import importlib.util, sys
spec = importlib.util.spec_from_file_location('m', '$SCRIPT')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
result = mod._extract_repo_dir('gh pr create --title test')
assert result is None, f'Expected None, got {result}'
print('PASS')
"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "PASS" ]]
}

@test "TC16d: cd with valid tilde path resolves to expanded absolute path" {
  # Create a temp directory under $HOME and reference it via ~/
  local rel_name="__bats_tilde_test_$$"
  local abs_path="$HOME/$rel_name"
  mkdir -p "$abs_path"
  run python3 -c "
import importlib.util, sys
spec = importlib.util.spec_from_file_location('m', '$SCRIPT')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
result = mod._extract_repo_dir('cd ~/$rel_name && gh pr create --title test')
assert result == '$abs_path', f'Expected $abs_path, got {result}'
print('PASS')
"
  rm -rf "$abs_path"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "PASS" ]]
}

@test "TC16e: cd with tilde path returns None when directory does not exist" {
  run python3 -c "
import importlib.util, sys
spec = importlib.util.spec_from_file_location('m', '$SCRIPT')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
result = mod._extract_repo_dir('cd ~/nonexistent_path_abc123 && gh pr create --title test')
assert result is None, f'Expected None for nonexistent tilde path, got {result}'
print('PASS')
"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "PASS" ]]
}
