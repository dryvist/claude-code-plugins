# testing — lightweight dispatcher for specialized browser and UI test agents.
# Default ON so every session can discover /test; it deliberately does not load
# Playwright, Browser Use, or DevTools tools into the main session.
{
  default = { enabled = true; };

  claudePlugins = [
    "testing@jacobpevans-cc-plugins"
  ];

  skills = [
    "test"
  ];

  claudeCommands = [ ];
}
