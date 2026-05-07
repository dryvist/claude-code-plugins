# browser-automation — browser-use + playwright.
# Default OFF. Useful for E2E testing or web scraping; otherwise idle.
{
  default = { enabled = false; };

  claudePlugins = [
    "browser-use@browser-use-skills"
    # playwright lives under claude-plugins-official's external_plugins/
    # not in a top-level marketplace named "playwright"
    "playwright@claude-plugins-official"
  ];

  skills = [
    "browser-use"
    "cloud"
    "open-source"
    "remote-browser"
    "playwright"
  ];

  claudeCommands = [ ];
}
