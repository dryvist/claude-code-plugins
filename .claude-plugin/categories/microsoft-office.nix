# microsoft-office — Office document formats (Word/Excel/PowerPoint).
# Default OFF. Plugin-level loss on Claude side: disabling document-skills
# also drops pdf/canvas-design/frontend-design/claude-api/mcp-builder/etc.
# The agentSkills side keeps those because we filter by skill name only.
# See Phase 2 in the design plan for synthetic-marketplace mitigation.
{
  default = { enabled = false; };

  claudePlugins = [
    "document-skills@anthropic-agent-skills"
  ];

  skills = [
    "pptx"
    "docx"
    "xlsx"
  ];

  claudeCommands = [ ];
}
