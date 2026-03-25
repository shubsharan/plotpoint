---
name: open-task
description: Deprecated legacy command. Plotpoint now uses feature PRDs, not task docs, as the atomic implementation unit.
user_invocable: true
---

# /open-task

This command is deprecated.

Plotpoint now uses this flow instead:

- roadmap in `docs/product/`
- epic in `docs/epics/`
- architecture docs in `docs/architecture/` as needed
- feature PRD in `docs/features/`
- feature branch + draft PR from the feature PRD

Do not use the old task-based workflow in this file.

Follow `docs/runbooks/spec-driven-delivery-workflow.md` and `docs/runbooks/doc-authoring-quickstart.md` until a dedicated `/start-feature` command replaces this legacy command.
