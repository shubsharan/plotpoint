# Tasks: Platform Architecture Guide

**Input**: Design documents from `/docs/features/0006-platform-architecture-guide/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Reader comprehension, architecture-only scope, repository-relative links, formatting,
workflow consistency, and the provider-free repository gate are explicit acceptance checks.

**Organization**: Tasks are grouped by user story so the guide first teaches the whole platform, then
makes models and contracts traceable, then orients contributors to the correct owner.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes a different file and has no incomplete dependency
- **[Story]**: Maps the task to a user story from the specification
- Every task names its exact file or verification target

## Phase 1: Setup

**Purpose**: Establish the architecture guide and its stable purpose

- [x] T001 Create the audience, purpose, platform definition, and responsibility split in `docs/architecture.md` using `docs/features/0006-platform-architecture-guide/contracts/architecture-guide.md`

---

## Phase 2: Foundational System Shape

**Purpose**: Create the visual and conceptual vocabulary required by every story

- [x] T002 Add the whole-system diagram, authority rule, and architectural-pattern table to `docs/architecture.md`

**Checkpoint**: Readers can identify the major systems and the design principles connecting them.

---

## Phase 3: User Story 1 - Understand the Whole Platform (Priority: P1) MVP

**Goal**: Explain the core concepts and full local/shared shape within a ten-minute reading path

**Independent Test**: A new reader can identify major systems, authority boundaries, and local versus
shared data flow without opening feature history.

### Implementation for User Story 1

- [x] T003 [US1] Explain project composition, immutable releases, aggregate runtime, progression, applications/components, capabilities, persistence, shared sessions, synchronization, and reports in `docs/architecture.md`
- [x] T004 [US1] Add separate project-to-release, local-command, and shared-command/recovery flows with authority and durable-owner callouts in `docs/architecture.md`

**Checkpoint**: The guide directly answers the recurring questions and each flow can be explained
independently.

---

## Phase 4: User Story 2 - Trace Models and Contracts (Priority: P2)

**Goal**: Let readers understand each core data model and continue into its owning contract

**Independent Test**: Every major model and flow reaches the exact contract or ADR that owns its
serialized details and rationale.

### Implementation for User Story 2

- [x] T005 [US2] Add aggregate, command/decision, progression, component-context, observation, shared-session, outbox, projection/snapshot, and report model explanations to `docs/architecture.md`
- [x] T006 [US2] Add the contract and ADR map, keep examples generic, and audit every repository-relative link in `docs/architecture.md`

**Checkpoint**: The guide teaches relationships without becoming a duplicate API specification.

---

## Phase 5: User Story 3 - Locate the Owning Boundary (Priority: P3)

**Goal**: Make execution, persistence, trust, and change ownership explicit

**Independent Test**: At least nine of ten representative changes lead to the correct subsystem and
contract boundary.

### Implementation for User Story 3

- [x] T007 [US3] Add authority/persistence and repository-boundary maps covering compiler, runtime, player, API, database, trusted modules, protocol, and examples in `docs/architecture.md`
- [x] T008 [US3] Add the ten-scenario change map, trust/privacy boundaries, architectural non-goals, and architecture-only maintenance rule in `docs/architecture.md`

**Checkpoint**: Contributors can place a change without leaking game rules, storage authority, or
platform capabilities into the wrong layer.

---

## Phase 6: Polish & Cross-Cutting Verification

**Purpose**: Make the guide discoverable and run every acceptance gate

- [x] T009 [P] Link `docs/architecture.md` from `README.md` as the primary “how Plotpoint works” entry point
- [x] T010 Run the comprehension, recurring-question, model/contract, architecture-only, ownership, and link checks in `docs/features/0006-platform-architecture-guide/quickstart.md`, then run `pnpm format`, `pnpm speckit:check`, `pnpm verify`, and `git diff --check`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependency
- **Foundational (Phase 2)**: Depends on T001 and blocks story prose
- **User Story 1 (Phase 3)**: Depends on T002 and provides the minimum useful guide
- **User Story 2 (Phase 4)**: Depends on the concepts and flows from User Story 1
- **User Story 3 (Phase 5)**: Depends on the complete model and contract vocabulary
- **Polish (Phase 6)**: Depends on all guide sections; T009 may be prepared after T001, while T010 waits
  for all content

### Within Each User Story

- Explain responsibility before exact fields.
- Link the primary contract instead of reproducing a complete interface.
- Name decision authority and durable ownership at every cross-system boundary.
- Complete the story checkpoint before moving to the next phase.

### Parallel Opportunities

- T009 changes only `README.md` and may run in parallel once `docs/architecture.md` exists.
- Contract/link audits can be researched independently, but edits to the guide remain sequential so it
  retains one coherent voice.
- Mechanical link and format checks may run independently after content is complete; full verification
  is the final sequential gate.

## Implementation Strategy

### MVP First

1. Complete T001-T002 to establish the mental model and system map.
2. Complete T003-T004 to teach the core concepts and three flows.
3. Perform the ten-minute comprehension test.

### Incremental Delivery

1. Setup and foundation -> understandable system shape
2. User Story 1 -> complete conceptual orientation
3. User Story 2 -> traceable data models and contracts
4. User Story 3 -> operational ownership and non-goals
5. Polish -> discoverability and full repository verification

### Execution Discipline

The guide is one coherent document, so tasks that edit `docs/architecture.md` run sequentially even
when their research can be parallelized. No task modifies runtime code, contracts, schemas, or
architecture decisions.

## Completeness Map

- **FR-001-FR-006**: T001-T004, T009
- **FR-007-FR-009**: T002, T005-T006
- **FR-010-FR-011**: T007-T008
- **FR-012**: Enforced by every task and verified by T010
- **SC-001-SC-002**: T003-T004, T010
- **SC-003**: T005-T006, T010
- **SC-004-SC-005**: T006, T008, T010
- **SC-006**: T007-T008, T010

## Notes

- The guide explains stable architecture; feature delivery state remains in feature and roadmap docs.
- Accepted ADRs govern wording; serialized contracts own exact shapes.
- No commit is part of this task list.
