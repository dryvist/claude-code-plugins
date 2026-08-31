#!/usr/bin/env python3
"""
Git Permission Guard - Blocks dangerous git/gh commands.

Exit 0 with JSON output for deny/allow decisions.
Most Bash commands are not git/gh - early exit is critical for performance.
"""

import json
import os
import re
import shlex
import subprocess
import sys


# Patterns checked ONLY when command starts with 'git ' to avoid false
# positives from matching substrings in gh api body text or other commands
DENY_GIT_ONLY = [
    (r"commit\s+.*(?<![\w-])(-\w*n\w*|--no-verify)\b", "bypasses pre-commit hooks"),
    (r"^(commit|tag)\s+.*(?<![\w-])--no-gpg-sign\b", "disables commit/tag signing (required_signatures rejects unsigned)"),
    (r"merge\s+.*--no-verify", "bypasses merge hooks"),
    (r"cherry-pick\s+.*--no-verify", "bypasses commit hooks"),
    (r"rebase\s+.*--no-verify", "bypasses commit hooks"),
    (r"config\s+.*core\.hooksPath", "changes hook directory"),
    # Only block explicit value-disabling forms; allow `--get`, `--unset`, and `commit.gpgsign true`.
    (r"^config\s+(?!.*--(?:get|list|unset))(?:\S+\s+)*\b(?:commit|tag)\.gpgsign\s+(?:false|0|off|no)\b", "disables commit/tag signing"),
    (r"^config\s+--unset\s+(?:commit|tag)\.gpgsign\b", "unsetting reverts signing to default-off"),
    (r"^push\s+.*(--force|--force-with-lease|-f)\b", "force-pushes overwrite remote history"),
    # Bulk-ref pushes publish every local ref, including local-only bookkeeping
    # refs (agent session transcripts under refs/heads/entire/*, scratch branches).
    # git accepts unambiguous long-option prefixes, so match by minimal unique
    # prefix rather than the full spelling:
    #   --all / --branches (synonyms) -> unique at --al and --b
    #   --mirror (pushes refs/*, a strict superset) -> unique at --m
    # No other `git push` option starts with al/b/m, and overmatching a
    # nonexistent flag is harmless (git rejects it anyway).
    # ^push anchor is load-bearing: `git stash push --all` must stay allowed.
    (r"^push\b.*(?<![\w-])--(?:al|b|m)[a-z-]*\b",
     "pushes all local refs at once, publishing local-only refs that were never meant for the remote"),
    (r"^push\b.*(?<![\w-])\+?refs/\S*\*",
     "uses a wildcard refspec, publishing every matching local ref"),
    (r"^config\s+.*\balias\.\S+.*\bpush\b.*(?<![\w-])(--(?:al|b|m)[a-z-]*|\+?refs/\S*\*)",
     "defines an alias that bulk-pushes local refs"),
]

# Commands that are allowed, but carry a caution note back to the agent.
#
# These used to emit permissionDecision "ask". They no longer do: an ask
# stops the agent and waits for a human, and in a scheduled run, CI job,
# container, or overnight session no human arrives — the run stalls until
# timeout and the session goal is abandoned. Every entry below is recoverable
# (reflog, re-clone, re-run), so a block was never warranted and a prompt was
# only ever a speed bump for an attended session.
#
# The genuinely unrecoverable git operations stay hard denials in
# DENY_GIT_ONLY / DENY_ALWAYS / BLOCKED_ON_MAIN — those are unchanged.
#
# Ordered from most specific to least specific to avoid false matches.
GUIDANCE_GIT = [
    ("commit --amend", "Rewrites the last commit"),
    ("worktree remove --force", "Removes worktree directory, discarding uncommitted changes"),
    ("worktree remove -f", "Removes worktree directory, discarding uncommitted changes"),
    ("cherry-pick", "Rewrites commit history"),
    ("merge", "Can create merge commits or conflicts"),
    ("reset", "Can lose uncommitted work permanently"),
    ("restore", "Can discard local changes"),
    ("rebase", "Rewrites commit history"),
    ("clean", "Removes untracked files permanently"),
    ("rm -rf", "Force-removes files recursively, discarding uncommitted changes permanently"),
    ("rm -f", "Force-removes files, discarding uncommitted changes permanently"),
    ("rm --force", "Force-removes files, discarding uncommitted changes permanently"),
    ("rm -r", "Recursively removes files from working tree and index"),
    ("prune", "Removes unreferenced objects"),
    ("gc", "May remove unreferenced objects"),
]

GUIDANCE_GH = []

DENY_GH = [
    ("pr comment", (
        "gh pr comment creates top-level issue comments that cannot be resolved or tracked.\n"
        "\n"
        "For code review feedback, you MUST use review threads (line-specific, resolvable comments) instead.\n"
        "\n"
        "Use the documented thread workflows for creating review comments, replying, and resolving threads:\n"
        "  - github-workflows/skills/resolve-pr-threads/graphql-queries.md\n"
        "  - github-workflows/skills/resolve-pr-threads/rest-api-patterns.md\n"
        "\n"
        "These workflows create resolvable, line-specific review threads — the only acceptable way to post review\n"
        "feedback on PRs."
    )),
]

# Regex patterns checked ONLY for gh commands - catches flag-based bypasses
# that token-prefix matching in DENY_GH cannot detect.
# Each pattern is (regex, reason_why_denied, context_specific_guidance).
# Git subcommands blocked when on the main branch — closes the full
# commit chain (stage → commit → push) that bypassed main-branch-guard
BLOCKED_ON_MAIN = {"add", "commit", "push"}

DENY_GH_REGEX = [
    (r"pr\s+merge\s+.*--admin\b",
     "bypasses all branch protection rules including required status checks",
     "Use the standard merge workflow instead."),
    (r"api\b(?=.*(?:-X|--method)\s+(?:PUT|PATCH|DELETE))(?=.*\b(?:rulesets|branches/[^/]+/protection)\b)",
     "modifies repository branch protection or rulesets directly",
     "Manage branch protections through the GitHub web interface instead."),
]

# Maps incorrect GraphQL mutation names to (correct_name, example_command).
# Based on log analysis: addPullRequestReviewComment (711 failures),
# resolvePullRequestReviewThread (162 failures).
WRONG_MUTATIONS = {
    "addPullRequestReviewComment": (
        "addPullRequestReviewThreadReply",
        (
            "gh api graphql --raw-field query='"
            "mutation { addPullRequestReviewThreadReply(input: {"
            "pullRequestReviewThreadId: \"THREAD_ID\", body: \"reply text\""
            "}) { comment { id } } }'"
        ),
    ),
    "resolvePullRequestReviewThread": (
        "resolveReviewThread",
        (
            "gh api graphql --raw-field query='"
            "mutation { resolveReviewThread(input: {"
            "threadId: \"THREAD_ID\""
            "}) { thread { id isResolved } } }'"
        ),
    ),
}


# Shell tokens that separate independently-executed commands.
# Backtick is included because `cmd` substitution runs cmd as its own command;
# shlex's default punctuation set omits it, which left it as a bypass.
_SEPARATORS = {"&&", "||", "|", "|&", ";", ";;", "&", "(", ")", "{", "}", "`", "\n"}

# shlex's default punctuation set is "();<>|&" — backtick added, same reason.
_PUNCTUATION = "();<>|&`\n"

# Wrappers whose -c argument is itself a command to inspect.
_SHELL_RUNNERS = {"bash", "sh", "zsh", "dash", "ksh"}


def _split_segments(command: str, depth: int = 0) -> list:
    """Split a shell command into independently-executed command segments.

    Without this, `cd /repo && git push --all` bypasses every git rule here,
    because the guard's git/gh detection only looked at the start of the whole
    command string.

    Quoted content survives as a single token and is re-quoted on rejoin, so a
    commit message mentioning a blocked command stays inert. On malformed shell
    input shlex raises ValueError; falling back to the whole command preserves
    the previous behaviour rather than failing open on a parse error.
    """
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=_PUNCTUATION)
        lexer.whitespace_split = True
        lexer.whitespace = " \t\r"
        tokens = list(lexer)
    except ValueError:
        return [command]

    segments, current = [], []
    for tok in tokens:
        if tok in _SEPARATORS:
            if current:
                segments.append(current)
                current = []
        else:
            current.append(tok)
    if current:
        segments.append(current)

    out = []
    for seg in segments:
        seg = _strip_env_prefix(seg)
        if not seg:
            continue
        # Recurse into `bash -c '<command>'` style wrappers.
        if depth < 3 and seg[0].rsplit("/", 1)[-1] in _SHELL_RUNNERS:
            for i, tok in enumerate(seg[1:-1], start=1):
                if tok == "-c":
                    out.extend(_split_segments(seg[i + 1], depth + 1))
                    break
        out.append(" ".join(shlex.quote(t) for t in seg))
    return out or [command]


def _strip_env_prefix(tokens: list) -> list:
    """Drop leading VAR=value assignments so `FOO=1 git push` is still seen as git."""
    i = 0
    while i < len(tokens) and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", tokens[i]):
        i += 1
    return tokens[i:]


def _heredoc_delimiter(line: str):
    quote = None
    index = 0
    while index < len(line):
        character = line[index]
        if quote:
            if quote == '"' and character == "\\":
                index += 2
                continue
            if character == quote:
                quote = None
            index += 1
            continue
        if character in "'\"":
            quote = character
            index += 1
            continue
        if character != "<" or index + 1 >= len(line) or line[index + 1] != "<":
            index += 1
            continue

        index += 2
        strip_tabs = index < len(line) and line[index] == "-"
        if strip_tabs:
            index += 1
        while index < len(line) and line[index].isspace():
            index += 1
        if index >= len(line):
            return None
        if line[index] in "'\"":
            delimiter_quote = line[index]
            end = line.find(delimiter_quote, index + 1)
            if end == -1:
                return None
            return line[index + 1:end], strip_tabs
        match = re.match(r"[A-Za-z_][A-Za-z0-9_]*", line[index:])
        if match:
            return match.group(0), strip_tabs
        return None
    return None


def _strip_heredoc_bodies(command: str) -> str:
    kept_lines = []
    delimiter = None
    strip_tabs = False
    for line in command.splitlines(keepends=True):
        if delimiter is not None:
            candidate = line.rstrip("\r\n")
            if strip_tabs:
                candidate = candidate.lstrip("\t")
            if candidate == delimiter:
                delimiter = None
            continue

        kept_lines.append(line)
        marker = _heredoc_delimiter(line)
        if marker:
            delimiter, strip_tabs = marker
    return "".join(kept_lines)


def _deny_always_reason(command: str):
    try:
        tokens = _strip_env_prefix(shlex.split(command))
    except ValueError:
        return None
    if not tokens:
        return None

    executable = os.path.basename(tokens[0])
    arguments = tokens[1:]
    touches_git_hooks = any(".git/hooks" in arg for arg in arguments)

    if executable == "pre-commit" and arguments[:1] == ["uninstall"]:
        return "removes pre-commit hooks"
    if executable == "rm" and touches_git_hooks:
        return "deletes git hooks"
    if executable == "chmod" and "-x" in arguments and touches_git_hooks:
        return "disables git hooks"
    return None


def _is_inside_work_tree(target_dir: str = "") -> bool:
    """Return True only if target_dir (or process cwd) is inside a git work tree.

    git rev-parse --is-inside-work-tree exits 0 but prints "false" inside a
    bare repo, so exit code alone is insufficient — stdout must equal "true".
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            cwd=target_dir or None,
            capture_output=True, text=True, timeout=2,
        )
        return result.returncode == 0 and result.stdout.strip() == "true"
    except (subprocess.SubprocessError, OSError):
        return False


def _resolve_effective_dir(target_dir: str, hook_cwd: str) -> str:
    """Resolve the effective git working directory for branch checks.

    - Absolute target_dir → use it directly.
    - Relative target_dir + hook_cwd → join them.
    - No target_dir → use hook_cwd (empty string means subprocess uses process cwd).
    """
    if not target_dir:
        return hook_cwd
    target_dir = os.path.expanduser(target_dir)
    if os.path.isabs(target_dir):
        return target_dir
    if hook_cwd:
        return os.path.join(hook_cwd, target_dir)
    return target_dir


def _is_on_main_branch(target_dir: str = "") -> bool:
    """Check if target_dir (or process cwd when empty) is on the main branch.

    Semantic check: work-tree guard first (bare repos and non-git dirs return
    False immediately), then branch-name lookup. Layout-agnostic — no
    directory-name convention assumed.

    GIT_GUARD_BRANCH_OVERRIDE: when set, returns (value == "main") without
    touching git. Intended for CI/test use only.
    """
    override = os.environ.get("GIT_GUARD_BRANCH_OVERRIDE")
    if override is not None:
        return override == "main"
    if not _is_inside_work_tree(target_dir):
        return False
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=target_dir or None,
            capture_output=True, text=True, timeout=2,
        )
        return result.returncode == 0 and result.stdout.strip() == "main"
    except (subprocess.SubprocessError, OSError):
        return False


def deny(reason: str) -> None:
    """Output deny decision and exit."""
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": f"BLOCKED: {reason}",
        }
    }))
    sys.exit(0)


# NOTE: there is deliberately no ask() emitter. This hook only ever decides
# "deny" or "allow" (optionally with guidance). An "ask" decision blocks on a
# human, which makes the hook a hang in any unattended run.


def allow_with_guidance(reason: str) -> None:
    """Allow command but show guidance for self-correction."""
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


def _strip_jq_content(command: str) -> str:
    """Remove --jq '...' and --jq "..." content to avoid false positives."""
    command = re.sub(r"--jq\s+'[^']*'", "", command)
    command = re.sub(r'--jq\s+"[^"]*"', "", command)
    command = re.sub(r"--jq\s+\S+", "", command)
    return command


def _strip_flag_values(command: str) -> str:
    """Remove -f/--field and similar flag values to avoid false positives in regex matching.

    This prevents legitimate API calls like:
      gh api ... -f body="See the rulesets docs"
    from being incorrectly denied because the body contains "rulesets".
    """
    # Remove -f / --field quoted values
    command = re.sub(r"(-f|--field)\s+'[^']*'", "", command)
    command = re.sub(r'(-f|--field)\s+"[^"]*"', "", command)
    # Remove -F / --raw-field quoted values
    command = re.sub(r"(-F|--raw-field)\s+'[^']*'", "", command)
    command = re.sub(r'(-F|--raw-field)\s+"[^"]*"', "", command)
    # Remove --input file references
    command = re.sub(r"--input\s+\S+", "", command)
    return command


def check_graphql_guidance(command: str) -> None:
    """Detect known gh api graphql failure patterns and emit corrective guidance.

    Allows the command to proceed (it will fail naturally) while showing the
    correct pattern inline so Claude can self-correct immediately.
    """
    warnings = []

    # Detection 1 - Shell $variable expansion (excluding --jq content)
    command_no_jq = _strip_jq_content(command)
    if re.search(r"\$[a-zA-Z]", command_no_jq):
        warnings.append(
            "SHELL VARIABLE EXPANSION: $variable in GraphQL queries is expanded by the shell before\n"
            "gh receives it, causing syntax errors. Use --raw-field with inline values instead:\n"
            "\n"
            "  WRONG:  gh api graphql -f query='mutation { ... threadId: $threadId }'\n"
            "  CORRECT: gh api graphql --raw-field query='mutation { ... threadId: \"ACTUAL_ID\" }'"
        )

    # Detection 2 - Wrong mutation names
    for wrong_name, (correct_name, example) in WRONG_MUTATIONS.items():
        if re.search(fr"\b{re.escape(wrong_name)}\b\s*\(", command):
            warnings.append(
                f"WRONG MUTATION NAME: '{wrong_name}' does not exist in the GitHub GraphQL API.\n"
                f"Use '{correct_name}' instead.\n"
                f"\n"
                f"  Example: {example}"
            )

    # Detection 3 - -f query= or -F query= flags (Go template processing)
    if re.search(r"\s-[fF]\s+query=", command):
        warnings.append(
            "WRONG FLAG: -f/-F applies Go template processing which causes variable expansion.\n"
            "Use --raw-field for GraphQL queries:\n"
            "\n"
            "  WRONG:  gh api graphql -f query='...'\n"
            "  CORRECT: gh api graphql --raw-field query='...'"
        )

    # Detection 4 - Multi-line indicators (trailing backslash or literal \n,
    # excluding false positives like \node, \name, \null, \number)
    if command.endswith("\\") or re.search(r"\\n(?![aouei])", command):
        warnings.append(
            "MULTI-LINE QUERY: GraphQL queries must be on a single line.\n"
            "Trailing backslashes and \\n sequences break gh api graphql.\n"
            "\n"
            "  WRONG:  gh api graphql --raw-field query=' \\\n"
            "            mutation { ... }'\n"
            "  CORRECT: gh api graphql --raw-field query='mutation { ... }'"
        )

    if warnings:
        header = "GRAPHQL GUIDANCE: This command has known failure patterns. Correct before retrying:\n\n"
        body = "\n\n".join(f"[{i + 1}] {w}" for i, w in enumerate(warnings))
        allow_with_guidance(header + body)


def main():
    # Parse input
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    # Only process Bash tool
    if data.get("tool_name") != "Bash":
        sys.exit(0)

    hook_cwd = data.get("cwd", "")
    raw_command = data.get("tool_input", {}).get("command", "").strip()
    if not raw_command:
        sys.exit(0)

    segments = _split_segments(_strip_heredoc_bodies(raw_command))
    for segment in segments:
        reason = _deny_always_reason(segment)
        if reason:
            deny(f"This command {reason}. Fix the underlying issue instead.")

    # Every git/gh rule below is evaluated per command segment, so a git command
    # chained after another (`cd /repo && git push --all`) is still inspected.
    # Any check that fires exits the process, so the first hit wins.
    for segment in segments:
        _check_segment(segment, raw_command, hook_cwd)

    # Allow by default (exit 0, no output)
    sys.exit(0)


def _check_segment(command: str, raw_command: str, hook_cwd: str) -> None:
    """Run the git/gh rules against one command segment.

    `command` is the segment; `raw_command` is the untouched original, used for
    display and for checks that depend on raw shell syntax.
    """
    target_dir = ""

    # EARLY EXIT: Most commands are not git/gh
    is_git = command.startswith("git ") or command == "git"
    is_gh = command.startswith("gh ") or command == "gh"
    if not is_git and not is_gh:
        return

    # Extract subcommand (handle -C <path>, -c <key=value>) + collect git config options
    if is_git:
        rest = command[4:] if command.startswith("git ") else ""
        git_config_opts = []
        # Strip git global options to find actual subcommand
        while rest:
            # -C <path>
            m = re.match(r'^-C\s+("[^"]+"|\'[^\']+\'|\S+)\s*(.*)', rest)
            if m:
                target_dir = m.group(1).strip("'\"")
                rest = m.group(2).strip()
                continue
            # -c <key=value>
            m = re.match(r'^-c\s+("[^"]+"|\'[^\']+\'|\S+)\s*(.*)', rest)
            if m:
                git_config_opts.append(m.group(1).strip("'\""))
                rest = m.group(2).strip()
                continue
            # Boolean global options take no argument (different parse from -C/-c)
            m = re.match(r'^(-p|-P|--paginate|--no-pager|--no-replace-objects|--bare)\s*(.*)', rest)
            if m:
                rest = m.group(2).strip()
                continue
            break
        subcommand = rest
    else:
        git_config_opts = []
        subcommand = command[3:] if command.startswith("gh ") else ""

    sub_tokens = subcommand.split()

    # Check git-specific DENY patterns against extracted subcommand (after early
    # exit to avoid false positives from matching substrings in non-git commands)
    if is_git:
        for pattern, reason in DENY_GIT_ONLY:
            if re.search(pattern, subcommand, re.IGNORECASE):
                deny(f"This command {reason}. Fix the underlying issue instead.")
        # Check git -c config options for hook/signing bypass attempts.
        # Anchor to the key portion to avoid false positives where the value
        # contains the key name as a substring.
        for opt in git_config_opts:
            if re.match(r"core\.hooksPath\s*(?:=|$)", opt, re.IGNORECASE):
                deny("This command bypasses configured hooks. Fix the underlying issue instead.")
            # Only deny explicit false values; allow `=true` and missing-value (which means true).
            if re.match(r"^(?:commit|tag)\.gpgsign\s*=\s*(?:false|0|off|no)\b", opt, re.IGNORECASE):
                deny("This command disables commit/tag signing. Fix the underlying issue instead.")
        # Fallback: detect -c core.hooksPath remaining in the subcommand when the
        # extraction loop broke early on an unrecognised git global option.
        # Successfully parsed -c opts are stripped from subcommand, so this
        # only fires for opts the loop didn't reach.
        # Use shlex tokenisation to avoid false positives from commit messages
        # that contain the literal substring (e.g. -m "... -c core.hooksPath ...").
        # On ValueError (malformed shell input such as unclosed quotes), treat as
        # non-matching: malformed input cannot be a valid -c core.hooksPath bypass,
        # and falling back to .split() would reintroduce the false-positive this
        # check was added to prevent.
        try:
            subcmd_tokens = shlex.split(subcommand)
        except ValueError:
            subcmd_tokens = []
        for i, tok in enumerate(subcmd_tokens):
            if tok == "-c" and i + 1 < len(subcmd_tokens):
                config_token = subcmd_tokens[i + 1]
                if re.match(r"^core\.hooksPath(=|$)", config_token, re.IGNORECASE):
                    deny("This command bypasses configured hooks. Fix the underlying issue instead.")
                if re.match(r"^(?:commit|tag)\.gpgsign\s*=\s*(?:false|0|off|no)\b", config_token, re.IGNORECASE):
                    deny("This command disables commit/tag signing. Fix the underlying issue instead.")

        if sub_tokens and sub_tokens[0] in BLOCKED_ON_MAIN and _is_on_main_branch(_resolve_effective_dir(target_dir, hook_cwd)):
            deny(
                f"'git {sub_tokens[0]}' is not allowed on the main branch. "
                "Create a worktree using `/superpowers:using-git-worktrees`."
            )

    # Check DENY_GH patterns (token prefix match on gh subcommand)
    if is_gh:
        for pattern, reason in DENY_GH:
            tokens = pattern.split()
            if tokens and sub_tokens[:len(tokens)] == tokens:
                deny(reason)

    # Check gh-specific regex DENY patterns (flag-based bypasses)
    # Strip quoted flag values first to avoid false positives from command arguments
    if is_gh:
        # Exempt gh api graphql from the api pattern to avoid blocking legitimate queries
        is_gh_api_graphql = sub_tokens[:2] == ["api", "graphql"]
        subcommand_for_regex = _strip_flag_values(subcommand) if not is_gh_api_graphql else ""

        for pattern, reason, guidance in DENY_GH_REGEX:
            if re.search(pattern, subcommand_for_regex, re.IGNORECASE):
                deny(f"This command {reason}. {guidance}")

    # Check GraphQL guidance (allow with corrective warnings).
    # Uses the raw command: segment splitting resolves shell quoting, which
    # would hide the trailing-backslash / literal-\n multi-line detection.
    if is_gh and sub_tokens[:2] == ["api", "graphql"]:
        check_graphql_guidance(raw_command)

    # Check GUIDANCE patterns - use word boundaries to avoid false matches
    # (e.g., "merge" shouldn't match "emergency"). These allow the command
    # and hand the agent a caution note rather than stalling on a prompt.
    patterns = GUIDANCE_GIT if is_git else GUIDANCE_GH
    for cmd, risk in patterns:
        # Match as exact token sequence at start of subcommand
        cmd_tokens = cmd.split()
        if len(sub_tokens) >= len(cmd_tokens) and sub_tokens[:len(cmd_tokens)] == cmd_tokens:
            allow_with_guidance(f"CAUTION: {risk}\nCommand: {raw_command}")

    # No rule fired for this segment; main() continues with the next one.


if __name__ == "__main__":
    main()
