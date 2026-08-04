<!--
Sync Impact Report
- Version change: template -> 1.0.0
- Added principles: Complete Product Loops; Durable Contracts; Honest Boundaries; Evidence Before Abstraction; Local-First Privacy
- Added sections: Delivery Gates; Development Workflow
- Removed sections: all unresolved template placeholders
- Templates: .specify/templates/plan-template.md compatible; spec-template.md compatible; tasks-template.md compatible
- Follow-up TODOs: none
-->
# Plotpoint Constitution

## Core Principles

### I. Complete Product Loops

Every active delivery feature MUST close a usable loop for a named audience. A package, protocol,
service, or isolated demonstration is not sufficient evidence by itself. Each loop MUST identify the
authoring input, playable outcome, learning return, and concrete exit evidence. Later infrastructure
MUST be pulled by a demonstrated loop rather than scheduled only because it appears in the platform
architecture.

### II. Durable Contracts Stay Small

Immutable releases, deterministic typed commands, explicit observations, versioned aggregates,
atomic accepted transitions, and authorized projections are Plotpoint's durable invariants. Public,
persisted, or cross-process contracts MUST be minimal, versioned independently, and changed only
through an Accepted ADR. Repository packages and internal APIs MUST NOT be treated as product
contracts without evidence that independent compatibility is required.

### III. Trust Boundaries Are Honest

Specifications, diagnostics, and product claims MUST distinguish validation, trusted execution,
isolation, authenticity, authorization, and durability. A closed import graph is not a sandbox;
structural artifact integrity is not publisher authenticity; trusted release execution is not hostile
code isolation. Stronger claims require direct evidence at the exact boundary where they are made.

### IV. Evidence Before Abstraction

New capability catalogs, module systems, services, recovery machinery, queues, and generalized
conflict policies MUST be justified by a current product loop. The implementation MUST choose the
fewest execution environments and code boundaries that can close that loop. Representative games,
interruption tests, and external-consumer-style use are preferred evidence over interface sketches.

### V. Local-First Privacy and Recovery

Accepted local progress MUST survive destruction of disposable views and temporary loss of
connectivity. Durable acceptance MUST occur only after the owning transaction commits. Diagnostics
and exported learning records MUST redact credentials, protected content, raw durable state,
sensitive command fields, and precise sensor observations unless a separate explicit policy permits
them.

## Delivery Gates

- Every feature MUST link one parent epic and every governing ADR.
- Major architecture impact MUST have matching Accepted ADR links in the feature spec and plan before
  implementation begins.
- Specifications MUST define independently testable user journeys and measurable product evidence.
- Plans MUST show how each new subsystem closes the active loop and which future platform concerns
  remain deferred.
- A loop is Done only when its exit evidence is recorded and its merged pull request is verified.

## Development Workflow

Work proceeds through specification, clarification when needed, accepted architecture decisions,
planning, dependency-ordered tasks, implementation, and provider-free verification. Tests MUST cover
contract boundaries, deterministic behavior, failure atomicity, interruption recovery, and redaction
in proportion to the feature. Generated epic, roadmap, ADR, and active-plan references MUST remain in
sync. Unrelated user-owned worktree changes MUST be preserved.

## Governance

This constitution governs Plotpoint specifications, plans, tasks, and implementation. Amendments
require an explicit user-approved change, a semantic version bump, an updated Sync Impact Report,
and propagation through affected templates and guidance. Compliance is reviewed during planning and
again before implementation. Exceptions are not implicit; any necessary violation MUST be recorded
in the plan's Complexity Tracking section with the rejected simpler alternative.

**Version**: 1.0.0 | **Ratified**: 2026-08-03 | **Last Amended**: 2026-08-03
