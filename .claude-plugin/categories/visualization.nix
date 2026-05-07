# visualization — visual-explainer HTML diagram/slide generators.
# Default OFF. Output-heavy; useful for write-ups, not coding.
#
# visual-explainer plugin lives in nicobailon/visual-explainer marketplace
# which is not in claude-plugins-official. Its commands aren't synthesized to
# skills today (the plugin isn't passed through discoverClaudeCommands), so
# claudeCommands is empty pending an agent-skills wire-up update.
{
  default = { enabled = false; };

  claudePlugins = [
    "visual-explainer@visual-explainer-marketplace"
  ];

  skills = [
    "generate-web-diagram"
    "generate-slides"
    "diff-review"
    "plan-review"
    "generate-visual-plan"
    "project-recap"
    "fact-check"
  ];

  claudeCommands = [ ];
}
