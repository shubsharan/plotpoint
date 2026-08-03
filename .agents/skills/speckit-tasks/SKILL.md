---
name: speckit-tasks
description: Create a minimal dependency-ordered checklist for the active feature.
---

# Feature Tasks

Run `.specify/scripts/bash/setup-tasks.sh --json`, read `spec.md` and `plan.md`, and replace the
template examples with the smallest dependency-ordered checklist that implements and verifies the
feature. Use sequential `TNNN` identifiers and exact paths. Add `[P]` only when tasks can safely run
in parallel. Do not create phases, stories, or ceremonial tasks unless the work itself requires them.
