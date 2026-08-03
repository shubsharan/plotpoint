---
status: Pending
---

# Feature: Run Resumable Policy Sweeps

**Branch**: `feature/0004-policy-sweep`
**Epic**: [Prove the Policy Loop](../../epics/0001-prove-policy-loop/epic.md)
**PR**: Pending

## Outcome

A team can safely execute and resume the complete experiment without duplicated work or hidden missing results.

## Requirements

- **FR-001**: Dataset, experiment, policy variants, agent configuration, evaluator references, repetitions, and execution seed MUST be immutable and versioned.
- **FR-002**: The frozen experiment MUST expand deterministically into 1,500 stable run specifications.
- **FR-003**: Every run specification MUST include its policy variant, dataset case, repetition, agent version, evaluator versions, resolved configuration, and stable run ID.
- **FR-004**: Runs MUST execute through Postgres jobs with expiring worker leases, idempotent handlers, bounded concurrency, and bounded retries.
- **FR-005**: Every job and external operation MUST use a stable idempotency key.
- **FR-006**: Cancellation MUST stop new leases, allow already leased work to reach a terminal state, and preserve the ability to resume unfinished work.
- **FR-007**: The CLI MUST provide `plotpoint plan` and `plotpoint sweep`; sweep MUST require authorization matching the exact planned experiment and spend ceiling.
- **FR-008**: Planned, running, completed, and failed runs MUST remain distinguishable, and failed runs MUST remain experimental outcomes rather than being silently excluded.

## Acceptance Criteria

- Replanning identical inputs produces the same ordered run IDs.
- A forced worker interruption resumes without rerunning completed model or tool operations.
- All 1,500 planned runs eventually have explicit terminal outcomes, with no missing or duplicate run specifications.
- Planned and actual costs are comparable, and partial results are visibly incomplete.
- The full provider-backed sweep runs only after its exact plan and maximum spend are explicitly authorized.

## Non-Goals

- Kubernetes.
- Kafka.
- Temporal.
- Unbounded retries.
- Adaptive search.
- Early stopping that changes the frozen experiment.
- Policy recommendation logic.

## Architecture Decisions

None.
