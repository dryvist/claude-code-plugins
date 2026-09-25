# testing — browser/UI test tooling plus its lightweight agent dispatcher.
# Default ON so every session can discover /test; Playwright and Browser Use
# are reached only through the dedicated testing agents, never the main
# session context. Generalized from the former browser-automation category.
{
  default = { enabled = true; };

  claudePlugins = [
    "testing@jacobpevans-cc-plugins"
    "browser-use@browser-use-skills"
    # playwright lives under claude-plugins-official's external_plugins/
    # not in a top-level marketplace named "playwright"
    "playwright@claude-plugins-official"
  ];

  skills = [
    "test"
    "browser-use"
    "cloud"
    "open-source"
    "remote-browser"
    "playwright"
  ];

  claudeCommands = [ ];
}
