---
name: speckit-analyze
description: Check the active feature, plan, tasks, epic, ADRs, and generated documentation without writing.
---

# Analyze Feature

Remain read-only.

1. Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`.
2. Run `.specify/scripts/bash/check-workflow.sh`.
3. Check that every requirement and acceptance criterion has implementation and verification work,
   that tasks do not add unrelated scope, and that task order is executable.
4. Report only actionable inconsistencies. A missing parent epic is invalid unless the feature says
   `Epic: None`. ADR links in `spec.md` and `plan.md` must match; Major impact requires Accepted ADRs.
