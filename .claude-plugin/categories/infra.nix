# infra — Terraform / Ansible / Proxmox / Kubernetes / cloud.
# Default ON for homelab + cloud DR work.
#
# Notes on plugin refs:
#  * ansible-workflows lives in basher83/lunar-claude marketplace, not in
#    jacobpevans-cc-plugins. The agent-skills auto-discovery picks up its
#    skills via discoverSkills when lunar-claude is registered as a marketplace.
#  * terraform/proxmox/iac plugin refs from external marketplaces are not
#    enumerated here yet — they were aspirational placeholders that didn't
#    map to verified plugin@marketplace pairs. Add them in a follow-up PR
#    once their canonical refs are confirmed.
{
  default = { enabled = true; };

  claudePlugins = [
    "infra-orchestration@jacobpevans-cc-plugins"
    "infra-standards@jacobpevans-cc-plugins"
    "ansible-workflows@lunar-claude"
  ];

  skills = [
    # jacobpevans infra-orchestration
    "orchestrate-infra"
    "sync-inventory"
    "test-e2e"
    # ansible-workflows@lunar-claude (verified deployed names)
    "ansible-fundamentals"
    "ansible-playbook-design"
    "ansible-role-design"
    "ansible-idempotency"
    "ansible-error-handling"
    "ansible-secrets"
    "ansible-proxmox"
    "ansible-testing"
  ];

  claudeCommands = [
    # No commands here — neither jacobpevans-cc-plugins nor lunar-claude is
    # passed to discoverClaudeCommands today. If/when they are, add the
    # synthesized "<plugin>-<command>" entries (e.g. "ansible-workflows-lint",
    # "infra-orchestration-orchestrate-infra") and the agent-skills wire-up
    # in nix-ai will start filtering them.
  ];
}
