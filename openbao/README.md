# openbao

The OpenBao-backed secrets access model as a Claude Code skill: **mint, don't
store**, and **reading is pre-authorized, writing is gated**.

Most credential mistakes are not "the token leaked" — they are "a standing token
existed at all." This plugin encodes the alternative: obtain a short-lived
credential from a secrets engine at the moment of use, and treat writing a secret
as a human-approved act rather than an ambient capability.

## What it covers

`/openbao-secrets` points to the `secrets-separation` agent rule, the single
statement of the secrets method: path grammar, zones, identity classes,
grants, engines, secret zero and credential handling. The skill restates none
of it. Which engines are configured, mount paths, role names and runbooks
belong in your own private operations docs.

A second skill, `/openbao-dynamic-aws-creds`, applies the model to one concrete
engine: replacing a static AWS access key with short-lived STS credentials
minted on demand via an AWS `credential_process` wrapper — architecture,
bring-up order, verification, and common failure modes.

## Installation

```bash
claude plugins add jacobpevans-cc-plugins/openbao
```

## Usage

No manual invocation required in most cases — the skill triggers when a task
involves obtaining or handling a credential. Invoke it explicitly with:

```text
/openbao-secrets
/openbao-dynamic-aws-creds
```

Reach for it before fetching any credential, wiring a service to a secret,
converging something that writes a secret, or whenever you are unsure whether a
credential may simply be taken.

## License

Apache-2.0
