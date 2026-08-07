# Data Model: Platform Architecture Guide

This feature adds no runtime or persisted data model. The entities below define the information model
used to keep the guide coherent without turning it into a second API specification.

## Architecture Concept

Represents one stable idea in the platform.

| Field          | Meaning                                                |
| -------------- | ------------------------------------------------------ |
| Name           | Human-oriented term used consistently across the guide |
| Responsibility | The one job the concept owns                           |
| Authority      | System allowed to decide or validate its facts         |
| Inputs         | Facts allowed to enter the boundary                    |
| Outputs        | Facts produced or exposed                              |
| Durable owner  | Store or artifact that persists the fact, when any     |
| Contracts      | Primary serialized contracts or ADRs                   |

Concept entries summarize relationships. Exact serialized fields remain in their contracts.

## System Boundary

Represents an execution, trust, or persistence boundary.

    Boundary
    ├── responsibility
    ├── accepted inputs
    ├── produced outputs
    ├── decision authority
    ├── durable owner
    └── cross-boundary contract

The principal boundaries are game project, compiler, immutable release, trusted WebView, native host,
SQLite, SecureStore, authoritative API, trusted mechanic adapter, and PostgreSQL.

## Data Model Entry

Represents a core model that readers must understand.

| Field         | Meaning                                            |
| ------------- | -------------------------------------------------- |
| Identity      | Stable ID and version fields                       |
| Schema        | Validator and schema digest that authorize data    |
| Lifecycle     | Creation, transition, recovery, and terminal rules |
| Relationships | References to other models                         |
| Authority     | System that may change it                          |
| Persistence   | Durable owner and atomicity boundary               |

The guide covers project configuration, game composition, release, aggregate model, aggregate
instance, command, decision, progression, component context, observation, shared-session binding,
outbox record, terminal result, projection, snapshot, and play report.

## Serialized Contract

A contract owns exact serialized fields and cross-boundary invariants.

Validation rules:

- The architecture guide names responsibilities and important fields only.
- The guide links the contract for complete shapes and compatibility rules.
- A contract has a semantic identity, a clear producer/consumer boundary, and centralized
  compatibility metadata only when parser selection requires it.
- An ADR explains why a boundary exists; a contract explains what crosses it.

## End-to-End Flow

An ordered sequence from intent to a durable and visible outcome.

    Flow
      -> actor computes or submits intent
      -> data crosses an explicit contract boundary
      -> authority validates and decides
      -> durable owner commits atomically
      -> consumer receives a committed or confirmed view

The guide defines three flows:

1. project configuration to verified and mounted release;
2. local intent to deterministic decision, SQLite commit, notification, and recovery; and
3. shared intent to durable outbox, authoritative decision, snapshot reconciliation, and recovery.

Each step names the executing authority and durable owner.

## Architectural Pattern

| Field          | Meaning                                                 |
| -------------- | ------------------------------------------------------- |
| Name           | Recognizable design pattern                             |
| Application    | How Plotpoint uses it                                   |
| Benefit        | Property it protects                                    |
| Boundary       | Systems or contracts shaped by it                       |
| Counterexample | Tempting alternative deliberately not used, when useful |

Patterns explain the reasons behind relationships; they do not add a new runtime abstraction.

## Change Ownership Entry

Maps an intended change to its owner and protects adjacent boundaries.

Validation rules:

- Ownership follows decision and persistence authority, not whichever file is closest.
- Game rules stay in release logic or the selected trusted mechanic adapter.
- Generic transport, persistence, and Host API contracts contain no game vocabulary.
- Cross-process or persisted changes still require their normal feature and ADR workflow.

## Source Reference

One repository-relative link to a primary artifact.

- Contracts own exact fields and cross-boundary invariants.
- ADRs own accepted architectural rationale and non-goals.
- Package and application directories show the responsible implementation boundary.
- Product and roadmap documents provide intent and sequencing, not the architecture definition.

Links avoid line anchors and external URLs. A renamed owning artifact triggers an architecture-guide
link review.
