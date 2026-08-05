---
status: Pending
---

# Feature Specification: Platform Architecture Guide

**Branch**: `feature/0006-platform-architecture-guide`
**Epic**: [Plotpoint Core Product Loops](../../epics/0001-plotpoint-core-platform/epic.md)
**PR**: Pending
**Created**: 2026-08-05
**Input**: Create a durable repository guide that explains how Plotpoint works: its data models,
contracts, system boundaries, execution flows, and architectural patterns.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Understand the Whole Platform (Priority: P1)

A project owner or new contributor can start from one discoverable guide and build an accurate mental
model of how a Plotpoint game moves from authoring through compilation, installation, local play,
authoritative shared play, recovery, and reporting.

**Why this priority**: Development moves faster than one person can reconstruct the architecture from
source files, feature plans, and ADRs. A shared mental model is the primary value of this feature.

**Independent Test**: Give the guide to a reader who has not recently studied the repository and ask
them to explain the platform boundaries, the local game path, and the shared game path without opening
the full feature history.

**Acceptance Scenarios**:

1. **Given** a reader starts at the repository entry point, **When** they follow the architecture link,
   **Then** they can identify the major systems, their responsibilities, and the direction of data
   flow.
2. **Given** a reader wants to understand how a game is defined, **When** they use the guide, **Then**
   they can distinguish project configuration, compiled composition, aggregate models, commands,
   progression, components, resources, and host capabilities.
3. **Given** a reader compares local and shared play, **When** they inspect the end-to-end flows,
   **Then** they can identify which authority executes decisions and which store owns each durable
   fact.

---

### User Story 2 - Trace Models and Contracts (Priority: P2)

A contributor can move from each architectural concept to the contract, ADR, or repository boundary
that defines it without treating the guide as a competing API reference.

**Why this priority**: The guide should teach relationships and invariants while serialized contracts
remain the authority for exact fields and wire shapes.

**Independent Test**: Select each major data model and flow in the guide and follow its links to the
primary repository artifact that defines or governs it.

**Acceptance Scenarios**:

1. **Given** a concept such as aggregate execution or shared recovery, **When** a reader follows its
   links, **Then** they reach the relevant contract or accepted ADR.
2. **Given** the guide summarizes a model, **When** a reader needs exact fields or invariants,
   **Then** the guide directs them to the owning contract instead of reproducing a second definition.
3. **Given** an example uses game-specific vocabulary, **When** a reader interprets it, **Then** the
   guide clearly keeps that vocabulary outside the platform abstraction.

---

### User Story 3 - Locate the Owning Boundary (Priority: P3)

A contributor or coding agent can identify where an architectural change belongs and which adjacent
systems must remain generic.

**Why this priority**: Understanding the shape of the code is most useful when it prevents game rules,
storage authority, transport, presentation, and native capabilities from leaking across boundaries.

**Independent Test**: Use the ownership map to place ten representative changes and confirm at least
nine point to the correct subsystem and contract boundary.

**Acceptance Scenarios**:

1. **Given** a change to game rules, **When** a contributor consults the guide, **Then** they place it
   in an aggregate command or trusted mechanic rather than generic transport or persistence.
2. **Given** a change to durability or recovery, **When** a contributor consults the guide, **Then**
   they identify the system that owns the durable fact and its cross-process contract.
3. **Given** a proposed new platform abstraction, **When** a contributor checks the architectural
   patterns and non-goals, **Then** they can evaluate it against Plotpoint's established constraints.

### Edge Cases

- Game-specific demo vocabulary must remain illustrative and must not define a core platform concept.
- Detailed serialized fields must remain owned by serialized contracts; the guide summarizes and links.
- A reader arriving from an AI-generated change must identify the correct ownership boundary before
  editing a nearby but incorrect subsystem.
- Renamed contracts, ADRs, or repository boundaries must not leave central navigation broken.
- Progression status and synchronization status are domain models; they must not be confused with
  project delivery reporting.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The repository MUST provide one stable, discoverable architecture guide and link it from
  the repository's primary introduction.
- **FR-002**: The guide MUST begin with a concise mental model suitable for a reader who does not know
  the repository structure.
- **FR-003**: The guide MUST explain project configuration, immutable releases, game composition,
  aggregate state, commands, progression, applications, components, content/assets, capabilities,
  host persistence, authoritative shared sessions, synchronization, and play reports.
- **FR-004**: The guide MUST explain how a game is defined, how progression nodes and transitions work,
  where component and game logic live, and how multiplayer authority is declared and executed.
- **FR-005**: The guide MUST separately explain compiling a release, executing a local action, and
  executing and recovering a shared action.
- **FR-006**: The guide MUST identify the authority and durable owner for release bytes, local aggregate
  state, observations, queued shared actions, authoritative shared state, confirmed projections, and
  reports.
- **FR-007**: The guide MUST describe the principal data models and show how their identities,
  schemas, versions, and relationships cross system boundaries.
- **FR-008**: The guide MUST name the architectural patterns Plotpoint uses, explain why they fit, and
  identify deliberately excluded patterns where that clarifies the design.
- **FR-009**: Every major section MUST link to the primary contract or ADR that owns exact details.
- **FR-010**: The guide MUST include a change-orientation section that maps common changes to their
  owning subsystem.
- **FR-011**: The guide MUST remain an architecture document rather than a delivery report: no dated
  snapshot, task counts, migration ledger, or current/planned/deferred status vocabulary.
- **FR-012**: The feature MUST change documentation only and MUST NOT alter runtime behavior, public
  contracts, persisted schemas, authority boundaries, or accepted decisions.

### Key Entities

- **Architecture guide**: The human-oriented map of Plotpoint's models, contracts, flows, boundaries,
  and patterns.
- **System boundary**: An execution or authority boundary with explicit inputs, outputs, and durable
  ownership.
- **Data model**: A stable platform concept with identity, schema, lifecycle, and relationships.
- **Contract**: The authority for serialized fields and cross-boundary behavior.
- **End-to-end flow**: An ordered explanation of data crossing systems until a durable result exists.
- **Architectural pattern**: A named design approach and the specific role it plays in Plotpoint.
- **Evidence link**: A repository-relative reference to the contract or ADR that owns a claim.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A new reader can identify the major systems, authority boundaries, and the difference
  between local and shared play within 10 minutes.
- **SC-002**: A reader can answer how games, progression, components, logic, and multiplayer are defined
  using the guide and its links.
- **SC-003**: Every major data model and end-to-end flow has at least one working link to its primary
  contract or decision.
- **SC-004**: Review finds zero delivery-status lines, task counts, or current-versus-planned migration
  sections in docs/architecture.md.
- **SC-005**: Review finds zero game-specific concepts presented as mandatory platform architecture.
- **SC-006**: A contributor can select the correct owning subsystem for at least 9 of 10 representative
  changes using the ownership map.

## Assumptions

- The guide is for the project owner, contributors, reviewers, and AI coding agents; it is not a public
  API reference or a replacement for feature quickstarts.
- docs/architecture.md is the stable guide location, with a short link from the root README.
- Accepted ADRs govern architectural decisions, while serialized contracts own exact data and wire
  shapes.
- Small generic examples and diagrams are useful, but reference-game rules must not become platform
  abstractions.
- The guide changes when composition, authority, persistence, or lifecycle architecture changes, not
  when ordinary feature delivery status changes.

## Architecture Decisions

- [ADR-0001: Deterministic Runtime and Integrated Game Architecture](../../adrs/0001-deterministic-runtime-contract.md)
- [ADR-0002: Deterministic and Immutable Release Artifacts](../../adrs/0002-immutable-release-format.md)
- [ADR-0003: Trusted WebView Release Runtime](../../adrs/0003-trusted-webview-runtime.md)
- [ADR-0004: Host-Owned Atomic Player Persistence](../../adrs/0004-atomic-player-persistence.md)
- [ADR-0005: Authoritative Shared Sessions and Snapshot Recovery](../../adrs/0005-authoritative-shared-session-sync.md)
- [ADR-0006: Unversioned Contract Names](../../adrs/0006-unversioned-contract-names.md)
