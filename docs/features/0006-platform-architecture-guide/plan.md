# Implementation Plan: Platform Architecture Guide

**Branch**: `feature/0006-platform-architecture-guide` | **Date**: 2026-08-05 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from
`/docs/features/0006-platform-architecture-guide/spec.md`

## Summary

Create one human-oriented `docs/architecture.md` that explains Plotpoint's system shape, core data
models, serialized contracts, authority boundaries, local and shared execution flows, persistence
ownership, and architectural patterns. Use progressive disclosure, compact diagrams, generic examples,
and primary repository links, then link the guide from the root README. The feature changes
documentation only.

## Technical Context

**Language/Version**: GitHub-flavored Markdown with Mermaid diagrams; repository source examples are
TypeScript 7.0.2 but are not modified
**Primary Dependencies**: Existing README, accepted ADRs 0001-0006, Unified Game Composition contracts,
package boundaries, and Oxfmt; no new dependency
**Storage**: Git-tracked Markdown only; no runtime or persisted-data change
**Testing**: Oxfmt, Spec Kit synchronization/workflow checks, repository-relative link audit, manual
ten-minute comprehension walkthrough, `pnpm verify`, and `git diff --check`
**Target Platform**: GitHub, Codex, and local Markdown viewers used by project owners, contributors,
reviewers, and AI coding agents
**Project Type**: Documentation-only feature inside the existing TypeScript monorepo
**Performance Goals**: A new reader reaches an accurate platform/local/shared mental model in 10
minutes; every major model and flow links to its primary contract
**Constraints**: Do not change behavior or contracts; do not make demo-game vocabulary a platform
abstraction; do not duplicate complete contract shapes; do not turn architecture into delivery status;
keep links repository-relative and useful without line anchors
**Scale/Scope**: One durable guide, one README entry, six governing ADRs, seven serialized contracts,
three end-to-end flows, one architectural-pattern map, and one contributor ownership map

## Constitution Check

_GATE: Evaluated before Phase 0 research and again after Phase 1 design._

### Pre-Research Gate

- **PASS - Complete product loop**: The guide closes a concrete owner/contributor comprehension loop
  from repository entry point to architecture and change ownership.
- **PASS - Small durable contracts**: No public, persisted, or cross-process contract changes. Exact
  shapes remain in their serialized contract documents.
- **PASS - Honest boundaries**: The guide states authority, trust, privacy, and persistence boundaries
  directly without using delivery state as architecture.
- **PASS - Evidence before abstraction**: The outline follows accepted ADRs and exact contracts; it
  invents no new runtime layer.
- **PASS - Local-first privacy and recovery**: The guide explains recovery and redaction without copying
  protected state or observations.
- **PASS - Delivery governance**: The spec links the active epic and all six governing accepted ADRs.
  Documentation-only `Impact: None` requires no new ADR.

### Post-Design Gate

- **PASS - One orientation source**: One stable guide links outward to primary contracts and decisions
  instead of creating another API authority.
- **PASS - Architecture-only model**: The content contract excludes snapshots, task counts, migration
  ledgers, and current/planned/deferred labels.
- **PASS - Proportional structure**: Mental model, models, patterns, three flows, ownership map, and
  contract map cover the questions without adding a documentation framework.
- **PASS - Maintainability**: Repository-relative links avoid line-anchor churn, and review triggers
  cover material changes to composition, runtime, host, persistence, shared authority, and reports.
- **PASS - Verification**: The content contract and quickstart define comprehension, link, ownership,
  format, workflow, and full repository checks.

## Architecture Decisions

**Impact**: None

- [Deterministic Runtime and Integrated Game Architecture](../../adrs/0001-deterministic-runtime-contract.md) -
  **Accepted**; governs game composition, deterministic aggregate execution, progression, scoped
  components, and trusted mechanics.
- [Deterministic and Immutable Release Artifacts](../../adrs/0002-immutable-release-format.md) -
  **Accepted**; governs compiler/release identity, inventory, and verification.
- [Trusted WebView Release Runtime](../../adrs/0003-trusted-webview-runtime.md) - **Accepted**; governs
  the trust and isolation language for release execution.
- [Host-Owned Atomic Player Persistence](../../adrs/0004-atomic-player-persistence.md) - **Accepted**;
  governs local transition durability and WebView recovery.
- [Authoritative Shared Sessions and Snapshot Recovery](../../adrs/0005-authoritative-shared-session-sync.md) -
  **Accepted**; governs reusable shared authority, retry, revocation, privacy, and recovery.
- [Centralized Contract Evolution](../../adrs/0006-centralized-contract-evolution.md) - **Accepted**; governs
  plain symbols and semantic identifiers with compatibility metadata owned centrally.

## Project Structure

### Documentation (this feature)

```text
docs/features/0006-platform-architecture-guide/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── architecture-guide.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Repository Documentation and Owning Boundaries

```text
README.md                            # Discoverable entry link
docs/
├── architecture.md                 # Human-oriented architecture guide
├── product.md                      # Product direction
├── roadmap.md                      # Delivery sequencing
├── adrs/0001-0006                  # Accepted architectural rationale
└── features/0005-unified-game-composition/
    └── contracts/                  # Exact composition/runtime/host/shared/report shapes

packages/runtime/                   # Deterministic aggregate and progression semantics
packages/compiler/                  # Project validation, composition, and release assembly
packages/protocol/                  # Serialized release, host, shared, and report envelopes
apps/player/                        # WebView host, SQLite, capabilities, sync, and reports
apps/api/                           # Authoritative shared-session orchestration
packages/db/                        # PostgreSQL schema and transaction helpers
packages/modules/                   # Platform-owned trusted mechanics
examples/releases/                 # External-consumer-style architecture fixtures
```

**Structure Decision**: Add no package or documentation generator. `docs/architecture.md` is the
stable orientation layer; contracts and ADRs retain authority. README links to the architecture guide
and broader product direction.

## Implementation Design

### 1. Establish the Whole-System Mental Model

Open with one compact system map and the responsibility split among game project, compiler, release,
trusted WebView, native host, local stores, authoritative service, trusted mechanic, and PostgreSQL.
State the core rule: game policy computes decisions, while the owner of the durable fact commits them.

### 2. Explain Models and Composition

Explain Project Configuration, Game Composition, immutable releases, aggregate models and
instances, commands and decisions, progression, application/components, scoped resources, observations,
shared-session bindings, outbox records, projections, snapshots, and reports. Use small generic
examples and link exact fields to their contracts.

### 3. Teach the System Through Three Flows

Trace project-to-mounted-release, local-command-to-SQLite, and shared-intent-to-authoritative-snapshot
as separate flows. At each boundary identify the executor, validator, durable owner, and recovery rule.

### 4. Explain the Design Choices

Name the patterns that make the architecture composable and deterministic. Add authority/persistence
and repository ownership tables, a change-location map, architectural non-goals, and a contract/ADR
index. Do not add feature status, migration comparison, or demo-game walkthrough sections.

## Phase 0: Research

Research is complete in [research.md](research.md). It resolves guide location, stable information
architecture, model/example boundary, pattern vocabulary, diagram/link policy, maintenance triggers,
and validation without introducing a new documentation tool.

## Phase 1: Design & Contracts

- [data-model.md](data-model.md) defines architecture concepts, system boundaries, model entries,
  contracts, flows, patterns, ownership entries, and source references.
- [architecture-guide.md](contracts/architecture-guide.md) defines the required concepts, contracts,
  flows, patterns, evidence rules, operational sections, and acceptance checks.
- [quickstart.md](quickstart.md) exercises the ten-minute reading path, recurring questions,
  traceability, change ownership, formatting, workflow, and repository verification.
- The Spec Kit block in `AGENTS.md` points to this plan.

## Phase 2: Implementation Planning

A separate task-generation step orders guide authoring, README discovery, link auditing, and repository
verification. No ADR acceptance or external dependency is required.

## Complexity Tracking

No constitution violation. The plan adds no runtime abstraction, code path, generated documentation,
dependency, public contract, persisted shape, or compatibility promise.
