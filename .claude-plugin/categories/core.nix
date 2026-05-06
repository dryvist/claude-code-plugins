# core — always-on baseline. Git, GitHub, code/project standards, session
# hygiene. The "what every session needs" category.
{
  default = {
    enabled = true;
    alwaysOn = true;
  };

  claudePlugins = [
    "git-guards@jacobpevans-cc-plugins"
    "git-workflows@jacobpevans-cc-plugins"
    "git-standards@jacobpevans-cc-plugins"
    "github-workflows@jacobpevans-cc-plugins"
    "code-standards@jacobpevans-cc-plugins"
    "project-standards@jacobpevans-cc-plugins"
    "config-management@jacobpevans-cc-plugins"
    "process-cleanup@jacobpevans-cc-plugins"
    "pal-health@jacobpevans-cc-plugins"
    "pr-lifecycle@jacobpevans-cc-plugins"
    "script-guards@jacobpevans-cc-plugins"
    "session-analytics@jacobpevans-cc-plugins"
  ];

  skills = [
    "agentsmd-authoring"
    "code-quality-standards"
    "git-workflow-standards"
    "gh-cli-patterns"
    "github-workflow-security-patterns"
    "infrastructure-standards"
    "pr-standards"
    "review-standards"
    "skills-registry"
    "sync-permissions"
    "quick-add-permission"
    "token-breakdown"
    "workspace-standards"
    "writing-rules"
  ];

  claudeCommands = [
    "commit-commands-commit"
    "commit-commands-commit-push-pr"
    "commit-commands-clean_gone"
    "git-workflows-sync-main"
    "git-workflows-troubleshoot-rebase"
    "git-workflows-troubleshoot-precommit"
    "git-workflows-troubleshoot-worktree"
    "git-workflows-wrap-up"
    "github-workflows-finalize-pr"
    "github-workflows-ship"
    "github-workflows-refresh-repo"
    "github-workflows-rebase-pr"
    "github-workflows-squash-merge-pr"
    "github-workflows-resolve-pr-threads"
    "github-workflows-shape-issues"
    "github-workflows-trigger-ai-reviews"
    "config-management-sync-permissions"
    "config-management-quick-add-permission"
    "session-analytics-token-breakdown"
    "codeql-resolver-resolve-codeql"
  ];
}
