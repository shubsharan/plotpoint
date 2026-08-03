---
status: Pending
---

# Feature: Define the First Experiment

**Branch**: `feature/0001-first-experiment`
**Epic**: [Prove the Policy Loop](../../epics/0001-prove-policy-loop/epic.md)
**PR**: Pending

## Outcome

Plotpoint has a frozen, reviewable experiment contract for determining which runtime budget best qualifies prospective Plotpoint early adopters.

## Requirements

- **FR-001**: The experiment MUST define an ICP-qualification task that returns structured company facts, citations, uncertainty, a qualified or not-qualified decision, and rubric-based reasons.
- **FR-002**: The dataset MUST version exactly 100 cases, stratified as 50 qualified and 50 not qualified, disclose its sampling method, and state that the class balance does not estimate market prevalence.
- **FR-003**: Case labels and reference facts MUST be independently curated for companies operating agentic coding, research, or data workflows with measurable economic decisions.
- **FR-004**: Live research tools MUST record retrieval timestamps, resolved tool configuration, and content-addressed returned artifacts so evidence can be inspected and replayed.
- **FR-005**: The experiment MUST predeclare budget variants of $0.05, $0.10, $0.20, $0.40, and $0.80 with three repetitions per case while holding every other policy parameter fixed.
- **FR-006**: Qualification accuracy MUST be the primary quality constraint with an initial target of at least 90%; evidence grounding MUST be a separate quality constraint, and cost, latency, and run reliability MUST remain separate reported metrics.
- **FR-007**: At least 80% of the weighted evaluation MUST be deterministic, with model-graded or human-reviewed components reported separately.
- **FR-008**: Planning MUST materialize a seeded, interleaved 1,500-run plan, report its estimated maximum spend, and require explicit authorization before paid execution.

## Acceptance Criteria

- The dataset manifest resolves exactly 100 immutable case definitions with stable IDs and a content digest.
- The experiment definition expands deterministically to 1,500 unique run specifications.
- The hypothesis identifies model selection, verification, and stopping as policy-sensitive decisions.
- Evaluator coverage demonstrates that at least 80% of the declared outcome can be scored deterministically.
- Planning reports the full estimated spend without executing paid work.

## Non-Goals

- Runtime implementation.
- Paid experiment execution.
- A general policy language.
- Production lead lists.
- Conclusions about Plotpoint product-market fit.

## Architecture Decisions

None.
