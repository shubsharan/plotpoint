---
status: Pending
---

# Feature: Build the Deterministic Policy Kernel

**Branch**: `feature/0002-policy-kernel`
**Epic**: [Prove the Policy Loop](../../epics/0001-prove-policy-loop/epic.md)
**PR**: Pending

## Outcome

A developer can execute, explain, and replay a fully deterministic budget-aware run without external services.

## Requirements

- **FR-001**: The kernel MUST define immutable, versioned policy, decision-context, runtime-decision, explanation, run-manifest, and canonical-event contracts.
- **FR-002**: Every controlled decision MUST expose remaining, spent, and reserved budget; elapsed time; steps; retries; prior failures; and available uncertainty.
- **FR-003**: Policy MUST be enforced before model or tool expenditure, and money MUST be represented without unsafe floating-point arithmetic.
- **FR-004**: The run ledger MUST record ordered append-only events with stable IDs, monotonic sequence numbers, schema versions, and correlation or causation links.
- **FR-005**: Deterministic fake agent, model, and tool adapters MUST cover success, retry, verification, budget exhaustion, tool failure, and human-review paths.
- **FR-006**: The CLI MUST provide `plotpoint validate`, `plotpoint run`, and `plotpoint replay`, and replay MUST perform no external operation.

## Acceptance Criteria

- Identical inputs produce identical decisions, events, and terminal results.
- Every material decision is traceable to its policy clause and input values.
- Invalid policies and budget violations fail before external work.
- Golden tests cover basic success, retry then success, budget exhaustion, verification, tool failure, and human review.
- Replaying a complete ledger reproduces its explanation and result without calling a model, tool, or database.

## Non-Goals

- Real providers.
- Postgres persistence.
- Dataset sweeps.
- Distributed scheduling.
- Evaluation aggregation.
- Policy recommendations.

## Architecture Decisions

None.
