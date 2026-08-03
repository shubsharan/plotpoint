---
name: speckit-adr
description: Create, accept, or supersede a minimal Architecture Decision Record and update feature references.
---

# Architecture Decision Record

Use an ADR only for a major decision: a datastore or operational dependency, public or persisted
contract, cross-cutting architecture, security boundary, deployment model, or departure from the
accepted architecture. Routine reversible choices do not need ADRs.

## Create

Run `.specify/scripts/bash/create-new-adr.sh --json --short-name "<slug>" "$ARGUMENTS"`, then fill
Context, Decision, and Consequences. Leave `status: Proposed` until the user explicitly approves the
decision. After approval, change it to `Accepted`.

Every relevant feature must link the ADR in both `spec.md` and `plan.md` using a relative
`../../adrs/NNNN-slug.md` link.

## Supersede

Create the replacement ADR. Set its `Supersedes` line to a link to the old ADR. After explicit user
approval, mark the replacement Accepted, mark the old ADR Superseded, and set the old ADR's
`Superseded by` link. Replace old ADR links in every affected feature spec and plan.

Finish with `.specify/scripts/bash/sync-docs.sh` and `.specify/scripts/bash/check-workflow.sh`.
