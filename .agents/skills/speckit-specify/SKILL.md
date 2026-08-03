---
name: speckit-specify
description: Create or update a minimal feature specification.
---

# Specify Feature

Use `$ARGUMENTS` as the feature request.

1. Run the mandatory `before_specify` Git hook once to create `feature/NNNN-<short-name>`, where
   `NNNN-<short-name>` is also the feature artifact directory name.
2. Run `.specify/scripts/bash/create-new-feature.sh --json --allow-existing-branch --short-name "<short-name>" "$ARGUMENTS"`.
3. Write `.specify/feature.json` with only `feature_directory`, using the repository-relative
   `docs/features/NNNN-<short-name>` path returned by the script.
4. Fill the short template: Outcome, testable Requirements, Acceptance Criteria, and Non-Goals.
5. Keep `status: Pending`. Set the exact `Branch` line.
6. Set `Epic` to a relative link to `../../epics/NNNN-<epic>/epic.md`, or `None` for a standalone
   feature. The referenced epic must already exist.
7. Keep Architecture Decisions as `None` unless an ADR already governs this feature. Every ADR link
   must use `../../adrs/NNNN-<decision>.md` and must also appear in `plan.md` once a plan exists.
8. Run `.specify/scripts/bash/sync-docs.sh` and report the feature path.

Do not add metadata, personas, sample stories, timelines, ownership, or other sections unless the
request genuinely requires them.
