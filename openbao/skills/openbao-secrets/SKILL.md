---
name: openbao-secrets
description: "Points to the secrets-separation rule, the one statement of the secrets method: path grammar, zones, identity classes, grants, engines, secret zero and credential handling. Use before fetching, wiring, granting or moving a credential."
license: Apache-2.0
metadata:
  version: 2.0.0
  author: dryvist homelab
  hermes:
    category: security
    tags:
      - openbao
      - secrets
      - credentials
      - approle
    related_skills:
      - native-first
---

# OpenBao Secrets Access

The secrets method has one home: the on-demand agent rule
`secrets-separation.md`, shipped with the shared agent instructions under
`rules/on-demand/`. Read that rule before you create, move, grant or consume
any credential. It covers:

- the path grammar and the zone mounts, and the placement test;
- the identity classes and how a grant is written;
- the arrangement document that renders every mount, identity and policy;
- engines before static secrets, and secret zero;
- forge credentials, handling rules and the failure signatures to expect.

This skill restates none of it, so the two can never disagree.

Your estate's own instance (which zones and engines exist, each identity and
its class, helper names, unlock commands) lives in your private documentation,
never in a public skill.
