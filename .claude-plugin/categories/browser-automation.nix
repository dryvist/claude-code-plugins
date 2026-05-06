# browser-automation — browser-use + playwright.
# Default OFF. Useful for E2E testing or web scraping; otherwise idle.
{
  default = { enabled = false; };

  claudePlugins = [
    "browser-use@browser-use-skills"
    "playwright@playwright"
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
