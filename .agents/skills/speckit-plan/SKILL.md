---
name: speckit-plan
description: Produce the smallest implementation plan for the active feature.
---

# Plan Feature

1. Run `.specify/scripts/bash/setup-plan.sh --json` and read the active `spec.md` plus the project
   constitution and relevant source files.
2. Fill only Approach, Changes, Architecture Decisions, and Verification. Create research or
   contract files only when they are necessary to remove a real implementation ambiguity.
3. Set `Impact` to `Major` only for a datastore or operational dependency, public or persisted
   contract, cross-cutting architecture, security boundary, deployment model, or departure from the
   accepted architecture. Otherwise use `None`.
4. For Major impact, create or identify an ADR. Link every governing ADR in both `plan.md` and the
   feature's `spec.md`. The links must match exactly. A Proposed ADR may document planning, but
   implementation cannot start until the user explicitly approves it and its status is Accepted.
5. Update the plan reference inside the `AGENTS.md` Spec Kit markers.
6. Run `.specify/scripts/bash/sync-docs.sh` and report the plan path.

Do not expand the plan into a generic architecture document.
