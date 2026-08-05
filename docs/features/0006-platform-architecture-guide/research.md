# Research: Platform Architecture Guide

## Guide Location and Audience

- **Decision**: Publish one stable docs/architecture.md for project owners, contributors, reviewers,
  and AI coding agents, linked directly from the root README.
- **Rationale**: Product direction, feature plans, ADRs, contracts, and source answer different
  questions. A stable orientation layer explains how they fit without replacing them.
- **Alternatives considered**: Expanding README.md would make the entry point too long. Reusing
  docs/product.md would blend product intent with system architecture. Keeping the explanation in a
  chat would be undiscoverable and unreviewable.

## Stable Architecture, Not Delivery State

- **Decision**: Describe Plotpoint's accepted data models, contracts, boundaries, and patterns in one
  architectural voice. Exclude dates, task counts, migration tracking, and current/planned/deferred
  labels.
- **Rationale**: A reader asks “how does Plotpoint work?”, not “what changed this week?”. Delivery
  state belongs in feature specifications, plans, tasks, evidence, and the roadmap.
- **Alternatives considered**: A dated implementation snapshot would become stale quickly and obscure
  the lasting mental model. A current-versus-target comparison would make the guide a migration ledger
  instead of an architecture reference.

## Information Architecture

- **Decision**: Use progressive disclosure: concise mental model, system diagram, patterns, composition,
  releases, aggregate runtime, application/components, native host, shared sessions, authority table,
  repository ownership map, non-goals, and contract map.
- **Rationale**: Readers first need the whole system, then its models and flows, then exact owning
  documents. This order answers common questions without forcing a package-by-package source tour.
- **Alternatives considered**: A glossary hides data flow. A package-first guide teaches folders before
  concepts. A contract-first guide is exact but too dense for orientation.

## Models and Examples

- **Decision**: Define platform models generically and use only small, clearly illustrative examples
  for command decisions and progression transitions.
- **Rationale**: Reference games validate the architecture but do not define it. Generic models make
  the guide apply equally to puzzles, tours, stories, and cooperative games.
- **Alternatives considered**: A detailed walkthrough of one demo game would overfit the architecture
  to that game's vocabulary. Pure abstraction without examples would be harder to learn.

## Diagrams and Contract Links

- **Decision**: Use compact Mermaid diagrams for multi-boundary relationships, tables for ownership and
  mappings, and repository-relative links without line anchors. Delegate exact serialized fields to
  serialized contracts.
- **Rationale**: Relationships are easier to understand visually, while relative links work locally
  and in hosted Markdown. Avoiding copied interfaces and line anchors reduces drift.
- **Alternatives considered**: Generated images are harder to edit and review. Reproducing complete
  interfaces would create competing contract authority.

## Architectural Pattern Vocabulary

- **Decision**: Name the patterns that explain Plotpoint's shape: functional core/imperative shell,
  hexagonal boundaries, aggregate roots, CQRS-lite, immutable artifacts, build-time composition,
  schema-narrowed registries, durable outbox/idempotency, complete snapshots, keyed single-flight, and
  scoped capabilities.
- **Rationale**: Pattern names let experienced readers connect the design to familiar ideas, while the
  Plotpoint-specific explanation prevents jargon from replacing understanding.
- **Alternatives considered**: Avoiding pattern names loses useful shared vocabulary. Listing patterns
  without explaining their concrete role would be decorative.

## Maintenance and Verification

- **Decision**: Review the guide when a governing ADR or core composition, runtime, host, persistence,
  shared-session, or report contract changes materially. Validate relative links, comprehension,
  formatting, Spec Kit consistency, and the provider-free repository gate.
- **Rationale**: Architectural semantics and renamed owning documents can make the guide stale; ordinary
  feature progress cannot. A manual guide with explicit architectural triggers is proportional.
- **Alternatives considered**: A generated guide cannot explain design intent well and adds a second
  build surface. Reviewing it for every feature status change recreates the delivery-report problem.
