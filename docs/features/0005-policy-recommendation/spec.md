---
status: Pending
---

# Feature: Recommend an Operating Policy

**Branch**: `feature/0005-policy-recommendation`
**Epic**: [Prove the Policy Loop](../../epics/0001-prove-policy-loop/epic.md)
**PR**: Pending

## Outcome

Plotpoint produces a reproducible, evidence-backed policy recommendation that the team would be willing to deploy to its own qualification workflow.

## Requirements

- **FR-001**: Evaluator definitions MUST be versioned, and every evaluation MUST retain its evidence and provenance.
- **FR-002**: Qualification accuracy, evidence grounding, cost, latency, and reliability MUST be aggregated without collapsing them into one unexplained score.
- **FR-003**: Terminal failures MUST remain part of reliability and outcome accounting rather than being excluded from analysis.
- **FR-004**: Reports MUST state sample sizes, experiment completeness, and 95% uncertainty intervals.
- **FR-005**: Recommendation MUST compute the observed Pareto frontier and preserve statistically indistinguishable configurations as ties.
- **FR-006**: Recommendation MUST select the lowest-cost observed policy satisfying the predeclared quality constraints and return `no qualifying policy` when none does.
- **FR-007**: Recommendation MUST NOT interpolate or recommend an unobserved configuration.
- **FR-008**: The CLI MUST provide `plotpoint recommend` and produce a content-addressed report linked to exact run, dataset, policy, evaluator, pricing, agent, and artifact versions.
- **FR-009**: Gate D MUST record the team's accept or reject decision and its rationale.

## Acceptance Criteria

- Deterministic fixtures cover dominance, ties, no qualifying policy, partial experiments, and failed runs.
- Every report conclusion traces to underlying evaluations and canonical runs.
- Re-running recommendation over unchanged records produces the same report content.
- The completed 1,500-run experiment yields either an accepted deployable policy or an explicit evidence-backed conclusion that the epic hypothesis failed.
- The feature is not marked Done merely because a recommendation was forced when constraints were unmet.

## Non-Goals

- Activating the policy in production.
- Target-mode optimization.
- Corpus-drift monitoring.
- Learned policies.
- Dashboards.
- Public SDK documentation.
- External beta validation.

## Architecture Decisions

None.
