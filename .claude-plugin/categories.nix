# Plugin / Skill Categories — entry point.
# Schema, asymmetry notes, and how-to-add-a-category are in categories.md.
# Per-category data lives in ./categories/<name>.nix to keep files small.
let
  importCategory = name: import ./categories/${name}.nix;

  categoryNames = [
    "core"
    "infra"
    "microsoft-office"
    "obsidian"
    "fabric"
    "browser-automation"
    "visualization"
    "huggingface"
  ];

  loaded = builtins.listToAttrs (
    map (name: {
      inherit name;
      value = importCategory name;
    }) categoryNames
  );
in
{
  schemaVersion = 1;

  defaults = builtins.mapAttrs (_: c: c.default) loaded;

  members = builtins.mapAttrs (_: c: {
    claudePlugins = c.claudePlugins or [ ];
    skills = c.skills or [ ];
    claudeCommands = c.claudeCommands or [ ];
  }) loaded;
}
