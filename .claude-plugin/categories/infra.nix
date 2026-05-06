# infra — Terraform / Ansible / Proxmox / Kubernetes / cloud.
# Default ON for homelab + cloud DR work.
{
  default = { enabled = true; };

  claudePlugins = [
    "infra-orchestration@jacobpevans-cc-plugins"
    "infra-standards@jacobpevans-cc-plugins"
    "ansible-workflows@jacobpevans-cc-plugins"
    "terraform-module-builder@anthropic-agent-skills"
    "proxmox-infrastructure@anthropic-agent-skills"
    "infrastructure-as-code-generator@anthropic-agent-skills"
  ];

  skills = [
    "ansible-fundamentals"
    "ansible-playbook-design"
    "ansible-role-design"
    "ansible-idempotency"
    "ansible-error-handling"
    "ansible-secrets"
    "ansible-proxmox"
    "ansible-testing"
    "building-terraform-modules"
    "generating-infrastructure-as-code"
    "proxmox-infrastructure"
    "orchestrate-infra"
    "sync-inventory"
    "test-e2e"
  ];

  claudeCommands = [
    "ansible-workflows-create-playbook"
    "ansible-workflows-create-role"
    "ansible-workflows-lint"
    "ansible-workflows-analyze"
    "infra-orchestration-orchestrate-infra"
    "infra-orchestration-sync-inventory"
    "infra-orchestration-test-e2e"
  ];
}
