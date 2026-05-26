#!/bin/bash
# PostToolUse hook: Validate markdown files after Write/Edit operations
#
# This hook runs automatically after Write or Edit tool calls.
# It validates .md files with markdownlint-cli2.
#
# Exit codes:
#   0 - Success (validation passed or not a markdown file)
#   2 - Blocking error (validation failed, stops Claude)

set -euo pipefail

# Fail open if jq is unavailable
if ! command -v jq &>/dev/null; then
  exit 0
fi

# Extract the file path from stdin, which contains the hook input JSON
file_path=$(jq -r '.tool_input.file_path // empty')

# Exit silently if no file path
if [[ -z "$file_path" ]]; then
  exit 0
fi

# Expand ~ to $HOME for consistent comparison
expanded_path="${file_path/#\~/$HOME}"

# Skip files in home dotfiles/dotdirs (e.g., ~/.config/, ~/.local/, ~/.claude/)
if [[ "$expanded_path" == "$HOME/".* ]]; then
  exit 0
fi

# Skip files within ANY .claude directory at ANY level
if [[ "$file_path" == */.claude/* ]]; then
  exit 0
fi

# Only validate markdown files
if [[ ! "$file_path" =~ \.md$ ]]; then
  exit 0
fi

# Skip if file doesn't exist (might have been deleted)
if [[ ! -f "$file_path" ]]; then
  exit 0
fi

# Collect validation errors
errors=()

# Run markdownlint-cli2
if command -v markdownlint-cli2 &>/dev/null; then
  # Config resolution: project config > user home config > plugin default
  config_flag=()
  has_project_config=false

  # Check for project-level markdownlint config (walk up from file's directory)
  search_dir="$(dirname -- "$file_path")"
  while true; do
    # $HOME and / are user/system scope, not project scope — check before scanning
    if [[ "$search_dir" == "${HOME:-}" || "$search_dir" == "/" ]]; then
      break
    fi
    shopt -s nullglob
    config_files=("$search_dir"/.markdownlint*)
    shopt -u nullglob
    if ((${#config_files[@]} > 0)); then
      has_project_config=true
      break
    fi
    # Stop at project root after checking for config there
    if [[ -e "$search_dir/.git" ]]; then
      break
    fi
    parent_dir="$(dirname -- "$search_dir")"
    [[ "$parent_dir" == "$search_dir" ]] && break
    search_dir="$parent_dir"
  done

  if [[ "$has_project_config" == "true" ]]; then
    # Let markdownlint-cli2 discover the project config naturally
    config_flag=()
  elif [[ -f "$HOME/.markdownlint-cli2.yaml" ]]; then
    # Use user's home config
    config_flag=(--config "$HOME/.markdownlint-cli2.yaml")
  else
    # Use plugin default config if available, otherwise create temporary fallback
    plugin_config="${CLAUDE_PLUGIN_ROOT:-}/config/.markdownlint-cli2.yaml"

    if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]] && [[ -f "$plugin_config" ]]; then
      # Plugin config exists and is readable
      config_flag=(--config "$plugin_config")
    else
      # Create temporary inline config with MD013 hardcoded to 160
      # mktemp must produce a filename markdownlint-cli2 recognises as a config
      # file (e.g. '.markdownlint-cli2.yaml'), so we create it inside a temp dir.
      temp_dir=$(mktemp -d)
      temp_config="$temp_dir/.markdownlint-cli2.yaml"
      trap 'rm -rf "$temp_dir"' EXIT

      cat > "$temp_config" <<'EOF'
config:
  default: true
  MD013:
    line_length: 160
    heading_line_length: 120
    code_block_line_length: 120
    tables: false
  MD060: false
fix: true
EOF

      config_flag=(--config "$temp_config")
    fi
  fi

  # markdownlint-cli2 requires the target file to be within its working directory.
  # Run from the config directory (when config found) or the file's own directory.
  if [[ "$has_project_config" == "true" ]]; then
    lint_dir="$search_dir"
  else
    lint_dir="$(dirname -- "$file_path")"
  fi
  if [[ "$lint_dir" == "/" ]]; then
    lint_file="${file_path#/}"
  else
    lint_file="${file_path#${lint_dir}/}"
  fi

  # markdownlint-cli2 only applies .markdownlintignore to glob-discovered files,
  # not explicitly passed paths. Check the ignore file manually before linting.
  ignore_file="$lint_dir/.markdownlintignore"
  if [[ -f "$ignore_file" ]]; then
    while IFS= read -r pattern || [[ -n "$pattern" ]]; do
      # Skip blank lines and comments
      [[ -z "$pattern" || "$pattern" == \#* ]] && continue
      # Strip trailing slash (directory patterns match the file inside too)
      pattern="${pattern%/}"
      # Match: exact filename, path ending with pattern, or any depth under the pattern directory
      if [[ "$lint_file" == "$pattern" || "$lint_file" == */"$pattern" || "$lint_file" == "$pattern"/* || "$lint_file" == */"$pattern"/* ]]; then
        exit 0
      fi
    done < "$ignore_file"
  fi

  if ! markdownlint_output=$( {
    cd "$lint_dir" || exit 1
    if (( ${#config_flag[@]} > 0 )); then
      markdownlint-cli2 "${config_flag[@]}" "$lint_file"
    else
      markdownlint-cli2 "$lint_file"
    fi
  } 2>&1 ); then
    errors+=("markdownlint-cli2 failed:")
    # Cap validator output so a noisy run can't flood Claude's context window.
    max_lines=20
    total_lines=$(awk 'END{print NR}' <<<"$markdownlint_output")
    if (( total_lines > max_lines )); then
      capped=$(awk -v max="$max_lines" 'NR<=max' <<<"$markdownlint_output")
      capped+=$'\n…and '"$((total_lines - max_lines))"' more line(s) (capped at '"$max_lines"'; rerun markdownlint-cli2 manually for the full report)'
      errors+=("$capped")
    else
      errors+=("$markdownlint_output")
    fi
  fi
fi

# Report errors if any
if [[ ${#errors[@]} -gt 0 ]]; then
  {
    echo "Markdown validation failed for: $file_path"
    echo ""
    printf '%s\n' "${errors[@]}"
    echo ""
    echo "Please fix these issues before continuing."
  } >&2
  exit 2
fi

exit 0
