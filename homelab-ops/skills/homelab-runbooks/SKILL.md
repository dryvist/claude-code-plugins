---
name: homelab-runbooks
description: Use when powering on a sleeping DR node, converging DNS records for a new ingress vhost, or bringing up OpenBao/Terrakube JWT identity — homelab operational runbooks for power management, DNS, and secrets-engine bring-up.
---

# Homelab Operations Runbooks

Generic, vendor/topology-neutral runbooks for recurring homelab operator
tasks. Every identifier below is a placeholder — substitute your own node
names, domain, and env-var values; never commit real ones.

## Operating note: secrets are var-names, never values

Every credential in this skill is referenced by its **environment/secret
variable name** (e.g. `IDRAC_USERNAME`, `<NODE>_BMC_HOSTNAME`), never a
literal value. When writing runbooks, commits, or PRs in a public repo:
reference the variable name that holds a secret, not the secret itself, and
never a real hostname/IP/node name either — use `<node>` / `proxmox-N` /
`<domain>` placeholders. See also: always address a host by its **FQDN**,
never a hardcoded IP — IPs are derived from a VLAN + host-id scheme and
silently go stale the moment a guest moves.

## Runbook 1: Power-managed DR node wake (Dell PowerEdge / iDRAC)

Some DR/standby nodes in a Dell PowerEdge estate sleep nightly to save power
and are woken on demand via their iDRAC BMC (`ipmitool`), same procedure for
any node in the class:

```bash
ipmitool -I lanplus -H <node>-bmc -U "$IDRAC_USERNAME" -E chassis power on
```

- `-E` reads the password from the `IPMITOOL_PASSWORD` env var — **never**
  put the password on the command line or in shell history.
- `IPMITOOL_PASSWORD` and `IDRAC_USERNAME` are sourced from the secrets
  engine at runtime; the BMC hostname comes from a per-node var, generalized
  here as `<NODE>_BMC_HOSTNAME`.
- On the target host, the credential is delivered via a root-only
  `EnvironmentFile` (mode 0600), never inlined in a unit file or script.

**Automation pattern** (e.g. an `idrac_power` Ansible role/play): gate the
power-on task on a per-node flag such as `pve_power_managed: true`, then
`ipmitool ... chassis power on` followed by `wait_for_connection` (poll SSH
until the node answers) before running any converge against it.

**Gotcha — BMC network isolation.** The BMC/OOB network is usually its own
isolated VLAN that the operator's own workstation cannot route to. Delegate
the `ipmitool` call to a controller host that already has OOB network
reachability (`delegate_to:` in Ansible) rather than trying to run it from
wherever the operator happens to be.

## Runbook 2: DNS ingress-alias record convergence

Internal split-horizon DNS (e.g. an HA pair of authoritative resolvers)
creates the A/CNAME records that let a reverse-proxy ingress vhost resolve
inside the network. These records are generated from the IaC inventory's
list of ingress entries — they are not created by hand.

1. Add or edit the ingress row in the inventory (new vhost, new backend
   target).
2. Re-run the DNS-tagged converge for the DNS role/play (e.g.
   `--tags dns` or equivalent) so the new record set is applied to both
   members of the HA pair.
3. Verify resolution from inside the network: `dig <new-vhost>.<domain>`.

**Gotcha.** A guest restart does not guarantee its DNS record survives —
re-run the DNS converge after any restart of a DNS-serving guest, and after
any ingress inventory change, before assuming a new vhost resolves.

## Runbook 3: Secrets-engine (OpenBao) → workload-identity (Terrakube) bring-up order

A central secrets engine acts as the machine-identity authority. A JWT auth
method on it validates workload tokens against an external OIDC issuer
(e.g. a CI/CD identity provider). Bring-up must happen in this order, or the
issuer-config write fails:

1. **DNS record for the issuer exists** — the secrets engine host must be
   able to resolve the issuer's hostname.
2. **Issuer service is up** — its `/.well-known/openid-configuration`
   discovery document must be reachable from the secrets-engine host.
3. **Secrets-engine issuer config is written** — only after 1 and 2 hold;
   otherwise the write fails with an "error checking oidc discovery URL"
   error, which almost always means step 1 or 2 wasn't satisfied yet, not a
   config-syntax problem.
4. **Workspace/role bindings are created** — scoped roles that map validated
   JWT claims to a policy, created last.

**Gotcha — default-on secrets engines.** Engines that are enabled by
default (e.g. a cloud-provider or SCM secrets engine) fail loud at converge
time if their backing credentials haven't been seeded yet. Skip them
explicitly until seeded, e.g. `-e '{"<engine>_enabled": false}'` (pass as a
JSON boolean, or ensure the consuming role coerces the value with `| bool`
in Jinja) rather than letting the play fail partway through.

## Related

- `infra-standards` (this marketplace) — VMID/IP ranges and the
  Terraform-to-Ansible inventory contract.
- `code-standards` / `secrets-policy` org rules — the four-tier secrets
  hierarchy this skill's "var-name, not value" note derives from.
