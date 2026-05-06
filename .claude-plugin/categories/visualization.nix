# visualization — visual-explainer HTML diagram/slide generators.
# Default OFF. Output-heavy; useful for write-ups, not coding.
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

  claudeCommands = [
    "visual-explainer-project-recap"
    "visual-explainer-generate-web-diagram"
    "visual-explainer-generate-slides"
    "visual-explainer-diff-review"
    "visual-explainer-plan-review"
    "visual-explainer-generate-visual-plan"
    "visual-explainer-fact-check"
  ];
}
