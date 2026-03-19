
| Field           | Value                       |
| --------------- | --------------------------- |
| **Type**        | PRD                         |
| **Feature ID**  | FEAT-0002                   |
| **Status**      | In Progress                 |
| **Epic**        | EPIC-0001                   |
| **Owner**       | product-engineering         |
| **Domains**     | Docs, Tooling, Git Workflow |
| **Last synced** | 2026-03-19                  |


# FEAT-0002 - Spec-Driven Delivery Automation

## Goal

Turn the spec-driven workflow into a lightweight, repeatable developer flow so starting and closing a feature branch is consistent with Plotpoint's roadmap -> epic -> feature PRD process.

## Background and Context

EPIC-0001 is not just about writing docs; it is about making the docs operational. The repo now defines a just-in-time planning model, but the implementation workflow still relies on manual discipline and a deprecated legacy command. This feature captures the automation and repo-level workflow support needed to make the new process easy to follow.

## Scope

### In scope

- define and implement the replacement for the legacy task-based command flow
- support starting work from a feature PRD in `docs/features/`
- encode branch naming, PR scaffolding, and status updates around `FEAT-XXXX`
- align workflow docs and agent guidance with the implemented command behavior
- deprecate or replace legacy task-oriented command paths that no longer fit the process

### Out of scope

- full Notion sync automation beyond what is needed for the current feature flow
- broad GitHub workflow automation unrelated to feature start/close
- project management tooling outside the repo workflow

## Requirements

1. There is a documented and implementable replacement for the old task-based `/open-task` flow.
2. Starting a feature from a PRD uses the `FEAT-XXXX` identifier, `FEAT-XXXX-<slug>` branch naming, and a draft-PR-first workflow.
3. The start flow updates the selected feature PRD to `In Progress` as part of the scaffolding step.
4. The close flow validates tests and acceptance criteria before marking work ready for review.
5. Repo docs, runbooks, and agent guidance stay aligned with the implemented command behavior.

## Architecture and Technical Notes

- Primary workflow references: `docs/runbooks/spec-driven-delivery-workflow.md` and `docs/runbooks/doc-authoring-quickstart.md`
- Agent guidance reference: `AGENTS.md`
- Implemented command wrappers: `.claude/commands/start-feature.md` and `.claude/commands/close-feature.md`
- Implemented shared skill: `.claude/skills/feature-workflow/SKILL.md`
- Legacy command reference deprecated: `.claude/commands/open-task.md`
- No dedicated architecture doc is required unless command implementation introduces a cross-cutting workflow or tooling decision.

## Acceptance Criteria

- A replacement feature-start workflow is defined for `FEAT-XXXX` PRDs.
- `/start-feature` and `/close-feature` are wired to one shared skill implementation.
- Legacy task-based command guidance is deprecated or replaced without conflicting instructions remaining in the repo.
- Starting a feature from a PRD has one documented path for branch creation, status update, docs commit, and draft PR creation.
- Closing a feature has one documented path for test verification and status updates.
- Workflow docs and agent guidance describe the same process.

## Test Plan

- Manually verify the documented start and close flows against an example feature PRD.
- Verify that repo docs no longer contain conflicting task-based workflow guidance.
- If a command/script is added, run it against a non-production example feature PRD and confirm the expected git and docs changes.

## Rollout and Observability

- Internal-only rollout for the team.
- Success is measured by whether new feature work can start from a PRD without ad hoc interpretation of the process.

## Risks and Mitigations

- Risk: automation becomes more complicated than the workflow it is trying to simplify. Mitigation: keep the first version narrow and focused on start/close feature flows only.
- Risk: docs and tooling drift apart again. Mitigation: require workflow doc updates in the same PR as automation changes.

## Open Questions

- None. This feature uses a Codex/assistant skill with command wrappers in `.claude/commands/`.
