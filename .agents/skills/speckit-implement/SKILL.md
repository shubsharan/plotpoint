---
name: speckit-implement
description: Implement the active feature tasks without prematurely marking the feature Done.
---

# Implement Feature

1. Run `.specify/scripts/bash/check-workflow.sh`; stop on any error.
2. Read `spec.md`, `plan.md`, and `tasks.md` from the active feature directory.
3. Change feature status from Pending to Active before implementation. Never set Done here.
4. Execute tasks in dependency order, marking each completed only after its verification passes.
5. Run the plan's verification and `.specify/scripts/bash/check-workflow.sh` again.
6. Run `.specify/scripts/bash/sync-docs.sh` and report completed work and remaining tasks.

A feature becomes Done only when `pnpm speckit:sync` later confirms that its `feature/NNNN-<slug>` PR was
merged. Code completion, green tests, a commit, or an open PR are not Done.
