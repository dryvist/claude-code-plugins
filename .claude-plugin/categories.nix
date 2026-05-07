# Plugin / Skill Categories — entry point.
# Schema, asymmetry notes, and how-to-add-a-category are in categories.md.
# Per-category data lives in ./categories/<name>.nix to keep files small.
#
# Auto-discovers category files: any *.nix in ./categories/ becomes a category
# named after the file (without the .nix suffix). To add a category, drop a
# new file into ./categories/ — no edits needed here.
let
  categoriesDir = ./categories;
  entries = builtins.readDir categoriesDir;
  isCategoryFile =
    name: type:
    type == "regular" && builtins.match ".+\\.nix" name != null && !(builtins.substring 0 1 name == ".");

  categoryFileNames = builtins.attrNames (
    builtins.foldl' (acc: name: if isCategoryFile name entries.${name} then acc // { ${name} = null; } else acc) { } (
      builtins.attrNames entries
    )
  );
  categoryNames = map (n: builtins.replaceStrings [ ".nix" ] [ "" ] n) categoryFileNames;

  loaded = builtins.listToAttrs (
    map (name: {
      inherit name;
      value = import (categoriesDir + "/${name}.nix");
    }) categoryNames
  );

  members = builtins.mapAttrs (_: c: {
    claudePlugins = c.claudePlugins or [ ];
    skills = c.skills or [ ];
    claudeCommands = c.claudeCommands or [ ];
  }) loaded;

  # Eval-time assertion: no skill or command name appears in two categories.
  # Catches accidental duplicates that would silently make `skillsToDrop`
  # over-broad in downstream consumers.
  allNames = builtins.concatLists (
    builtins.attrValues (builtins.mapAttrs (_: m: m.skills ++ m.claudeCommands) members)
  );
  countOccurrences =
    needle:
    builtins.length (builtins.filter (x: x == needle) allNames);
  duplicates = builtins.foldl' (
    acc: x: if builtins.elem x acc || countOccurrences x < 2 then acc else acc ++ [ x ]
  ) [ ] allNames;
  noDupes =
    if duplicates == [ ] then
      true
    else
      builtins.throw "categories.nix: skill/command names in multiple categories: ${
        builtins.concatStringsSep ", " duplicates
      }";
in
assert noDupes;
{
  schemaVersion = 1;

  defaults = builtins.mapAttrs (_: c: c.default) loaded;

  inherit members;
}
