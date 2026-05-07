# core — always-on baseline. Git, GitHub, code/project standards, session
# hygiene. The "what every session needs" category.
#
# Plugin / skill / command split:
#  * claudePlugins: every plugin this category enables in ~/.claude/settings.json.
#  * skills: SKILL.md folder names that deploy to ~/.agents/skills/. For
#    jacobpevans-cc-plugins these are the bare folder names under each
#    plugin's skills/ directory (no plugin prefix — agent-skills/discoverSkills
#    uses the bare folder name).
#  * claudeCommands: synthesized "<plugin>-<command>" skill names. Only
#    plugins from claude-plugins-official get commands→skills synthesis (via
#    agent-skills/discoverClaudeCommands), so this list contains only refs
#    whose owning plugin lives in claude-plugins-official.
{
  default = {
    enabled = true;
    alwaysOn = true;
  };

  claudePlugins = [
    # jacobpevans-cc-plugins
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
    "codeql-resolver@jacobpevans-cc-plugins"
    # claude-plugins-official — owns commit-commands, whose synthesized
    # skill names appear in claudeCommands below
    "commit-commands@claude-plugins-official"
  ];

  skills = [
    # jacobpevans project-standards
    "agentsmd-authoring"
    "skills-registry"
    "workspace-standards"
    # jacobpevans code-standards
    "code-quality-standards"
    "review-standards"
    # jacobpevans git-standards
    "git-workflow-standards"
    "pr-standards"
    # jacobpevans github-workflows
    "gh-cli-patterns"
    "finalize-pr"
    "refresh-repo"
    "rebase-pr"
    "squash-merge-pr"
    "resolve-pr-threads"
    "shape-issues"
    "ship"
    "trigger-ai-reviews"
    # jacobpevans git-workflows
    "sync-main"
    "wrap-up"
    "troubleshoot-precommit"
    "troubleshoot-rebase"
    "troubleshoot-worktree"
    # jacobpevans codeql-resolver
    "codeql-permission-classification"
    "github-workflow-security-patterns"
    # jacobpevans config-management
    "sync-permissions"
    "quick-add-permission"
    # jacobpevans session-analytics
    "token-breakdown"
    # jacobpevans content-guards
    "validate-readme"
    # jacobpevans infra-standards
    "infrastructure-standards"
    # jacobpevans ai-delegation
    "delegate-to-ai"
    "auto-maintain"
  ];

  claudeCommands = [
    # commit-commands@claude-plugins-official → discoverClaudeCommands
    "commit-commands-commit"
    "commit-commands-commit-push-pr"
    "commit-commands-clean_gone"
  ];
}
