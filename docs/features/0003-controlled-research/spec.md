---
status: Pending
---

# Feature: Control the Company-Research Workflow

**Branch**: `feature/0003-controlled-research`
**Epic**: [Prove the Policy Loop](../../epics/0001-prove-policy-loop/epic.md)
**PR**: Pending

## Outcome

The lead-qualification example performs real research differently under different Plotpoint policies while preserving evidence, explanations, and reconciled cost.

## Requirements

- **FR-001**: The existing `examples/lead-qualification` workflow MUST be adapted through a framework-neutral controlled-agent boundary.
- **FR-002**: Every model and research-tool expenditure MUST pass through a controlled wrapper.
- **FR-003**: Policy MUST affect research-model selection, retries, verification, and graceful stopping while the task and output contracts remain fixed.
- **FR-004**: Live research artifacts MUST be stored content-addressably, and citations MUST remain attached to the resulting structured facts.
- **FR-005**: Budget MUST be reserved and debited atomically; provider-reported usage MUST be reconciled against versioned pricing assumptions, and discrepancies MUST be exposed rather than presented as exact cost.
- **FR-006**: Versioned policies, resolved model and tool configurations, runs, events, calls, decisions, and artifacts MUST be persisted in Postgres.
- **FR-007**: The CLI MUST provide `plotpoint compare` for a small comparison requiring separate credential and spend authorization.
- **FR-008**: Gate B MUST compare at least five cases at two materially different budget levels before work proceeds to a dataset sweep.

## Acceptance Criteria

- Controlled model or tool calls cannot exceed the available unreserved budget.
- A budget-exhausted run terminates cleanly and retains a valid, inspectable trace.
- The same case produces at least one different model, verification, retry, or stop decision across the pilot policies; otherwise Gate B fails and the next feature is revised.
- Every live result retains its source artifacts, resolved configuration, pricing version, decision explanations, and reconciled ledger.
- Deterministic contract tests pass for each real adapter, while live tests require explicit credentials and spend authorization.

## Non-Goals

- The full 1,500-run sweep.
- Framework-specific public SDKs.
- A workflow DSL.
- Generalized observability.
- Production traffic enforcement.

## Architecture Decisions

None.
