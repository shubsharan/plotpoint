# Contract: Platform Architecture Guide

This is a documentation content contract, not a public runtime API. It defines the minimum structure
for docs/architecture.md so a reader can answer “how does Plotpoint work?” without reconstructing the
system from feature history.

## Required Opening

The guide begins with:

1. a concise definition of Plotpoint;
2. the division of responsibility between a game and the platform;
3. one compact system diagram; and
4. the central authority rule: game policy computes decisions, while the owning host or service
   commits durable facts.

The opening contains no dated snapshot, task count, migration state, or delivery-status legend.

## Required Concepts and Models

The guide explains, in human-oriented language:

- project configuration and compiler validation;
- immutable release identity, inventory, verification, installation, and release pinning;
- player, team, and session aggregate models and instances;
- typed commands, decisions, execution records, events, effects, and observations;
- progression nodes, legal domain-status transitions, explicit intents, and automatic rules;
- game applications/components, content, assets, scoped dependencies, and native capabilities;
- trusted WebView versus native-host responsibility;
- host-owned SQLite persistence and restart recovery;
- authoritative shared sessions, platform-owned trusted mechanics, PostgreSQL authority, complete
  projections, outbox submission, snapshot reconciliation, and revocation; and
- privacy-safe play reports.

It directly answers how a game is defined, how nodes and transitions work, where presentation and
domain logic live, and how multiplayer works.

## Required Contracts

The guide identifies the serialized contracts for:

- project configuration and compiled game composition;
- aggregate runtime behavior;
- host application/component lifecycle and local transition;
- trusted mechanic registration and execution;
- shared-session HTTP envelopes;
- durable shared recovery; and
- game play reports.

The guide summarizes these contracts but does not copy their complete interfaces or become a
compatibility authority.

## Required Flows

The guide separately traces:

1. game project to verified and mounted release;
2. local player intent to durable result and recovery; and
3. shared player intent to authoritative result, confirmed projection, and recovery.

Each flow identifies the executing authority, every important process boundary, and the durable owner
of the result.

## Required Architectural Patterns

The guide names each important pattern, explains its concrete use, and states the property it protects.
At minimum it covers:

- functional core and imperative shell;
- ports and adapters;
- aggregate roots;
- CQRS-lite;
- immutable content-addressed artifacts;
- build-time composition;
- schema-narrowed heterogeneous registries;
- durable outbox and idempotent receipts;
- complete snapshot recovery;
- keyed single-flight synchronization; and
- scoped capabilities and component lifetimes.

Non-goals are included only where they clarify why the architecture remains smaller or safer.

## Evidence and Link Rules

- Use repository-relative links without line anchors.
- Every major section links its owning contract or ADR.
- Link package/application directories when they clarify implementation ownership.
- Keep reference-game names and domain vocabulary inside clearly illustrative examples.
- Link product and roadmap documents only for broader intent and sequencing.

## Required Operational Sections

The guide includes:

- a package and system ownership map;
- a “where to make a change” table with at least ten representative changes;
- explicit trust, privacy, and architectural non-goal boundaries; and
- a contract and ADR map.

## Maintenance Triggers

Review the guide when any of these change materially:

- project configuration, compiler composition, release inventory, or verification;
- aggregate/command semantics or progression ownership;
- WebView/application/component lifecycle or Host API boundary;
- player persistence, observations, capabilities, or report contract;
- shared-session binding, authoritative adapter, synchronization, revocation, or recovery; or
- governing ADRs or primary contract locations.

Ordinary task completion, feature status, and release planning do not trigger architectural prose
unless they change one of these models or boundaries.

## Acceptance Checks

The guide is acceptable only when:

- a reader can explain the platform, local flow, and shared flow within 10 minutes;
- the common questions about games, progression, components, logic, and multiplayer are answered;
- the core data models and architectural patterns are explicit;
- all repository-relative links resolve;
- no delivery-status or migration ledger appears;
- no demo-game concept is presented as platform infrastructure;
- the ownership map selects the correct subsystem for at least 9 of 10 test changes;
- changed Markdown passes formatting and workflow validation; and
- the provider-free repository gate and git diff --check pass.
