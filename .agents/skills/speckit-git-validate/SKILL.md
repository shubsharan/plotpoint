---
name: speckit-git-validate
description: Validate the feature/NNNN-name branch and matching feature directory.
---

# Validate Feature Branch

Run `.specify/scripts/bash/check-workflow.sh`. The current branch must match `feature/NNNN-<slug>`, and
the active directory recorded in `.specify/feature.json` must have the identical `NNNN-<slug>`.
