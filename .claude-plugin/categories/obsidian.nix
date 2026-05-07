# obsidian — Obsidian-specific skills (markdown, bases, canvas, etc.).
# Default OFF. Useful only when actively editing an Obsidian vault.
{
  default = { enabled = false; };

  claudePlugins = [
    "obsidian@obsidian-skills"
    "obsidian-visual-skills@axton-obsidian-visual-skills"
  ];

  skills = [
    "obsidian-markdown"
    "obsidian-bases"
    "obsidian-canvas-creator"
    "obsidian-cli"
    "json-canvas"
    "defuddle"
    "excalidraw-diagram"
    "mermaid-visualizer"
  ];

  claudeCommands = [ ];
}
