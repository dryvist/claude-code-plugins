#!/usr/bin/env bats
# Test suite for git-guards/scripts/worktree-reminder.sh
#
# Tests the UserPromptSubmit hook's systemMessage injection. The hook keys off
# the branch alone and ignores the directory name (location-agnostic, #345):
#   - Not in a git repo → empty JSON, exit 0
#   - In git repo, branch is "main"/"master" → systemMessage present
#   - In git repo, any other branch → empty JSON, exit 0, whatever the dir name
#
# Each test that needs a git repo creates a temporary one in BATS_TMPDIR
# and tears it down in teardown().
#
# Run with: bats tests/git-guards/worktree-reminder/worktree-reminder.bats

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/git-guards/scripts/worktree-reminder.sh"
  load '../../helpers/git'

  if [[ ! -f "$SCRIPT" ]]; then
    echo "ERROR: Script not found at $SCRIPT" >&2
    return 1
  fi

  TMPDIR_BASE="$(mktemp -d)"
  export TMPDIR_BASE
}

teardown() {
  rm -rf "$TMPDIR_BASE"
}

# Run the hook from a specific directory
run_hook_in() {
  local dir="$1"
  run bash -c "cd '$dir' && /bin/bash '$SCRIPT'"
}

# ---------------------------------------------------------------------------
# TC1: Not in a git repo → empty JSON, exit 0
# ---------------------------------------------------------------------------

@test "TC1: not in a git repo outputs empty JSON" {
  local tmpdir
  tmpdir="$TMPDIR_BASE/not-a-repo"
  mkdir -p "$tmpdir"

  run_hook_in "$tmpdir"
  [ "$status" -eq 0 ]
  [[ "$output" == "{}" ]]
}

# ---------------------------------------------------------------------------
# TC2: Feature branch in a dir named "main" → empty JSON
#
# The hook is location-agnostic (#345): only the branch matters, never the
# directory name. A worktree that happens to sit in a dir called "main" is
# still a legitimate feature worktree.
# ---------------------------------------------------------------------------

@test "TC2: feature branch in dir named 'main' outputs empty JSON" {
  local repo_dir
  repo_dir="$TMPDIR_BASE/main"
  make_repo "$repo_dir" "feat/some-feature" >/dev/null

  run_hook_in "$repo_dir"
  [ "$status" -eq 0 ]
  [[ "$output" == "{}" ]]
}

# ---------------------------------------------------------------------------
# TC3: In git repo, branch is "main" → systemMessage present
# ---------------------------------------------------------------------------

@test "TC3: branch named 'main' injects systemMessage" {
  local repo_dir
  repo_dir="$TMPDIR_BASE/myrepo"
  make_repo "$repo_dir" "main" >/dev/null

  run_hook_in "$repo_dir"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "systemMessage" ]]
  [[ "$output" =~ "WARNING" ]]
  [[ "$output" =~ "worktree" ]]
}

# ---------------------------------------------------------------------------
# TC4: In git repo, feature branch, dir not "main" → empty JSON
# ---------------------------------------------------------------------------

@test "TC4: feature branch in non-main dir outputs empty JSON" {
  local repo_dir
  repo_dir="$TMPDIR_BASE/myrepo"
  make_repo "$repo_dir" "main" >/dev/null

  # Switch to a feature branch
  git -C "$repo_dir" checkout -q -b feat/add-feature

  run_hook_in "$repo_dir"
  [ "$status" -eq 0 ]
  [[ "$output" == "{}" ]]
}

# ---------------------------------------------------------------------------
# TC5: Both dir named "main" AND branch named "main" → still works
# ---------------------------------------------------------------------------

@test "TC5: dir named 'main' with branch 'main' injects systemMessage" {
  local repo_dir
  repo_dir="$TMPDIR_BASE/main"
  make_repo "$repo_dir" "main" >/dev/null

  run_hook_in "$repo_dir"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "systemMessage" ]]
}
