---
status: Accepted
---

# ADR: Centralized Contract Evolution

## Context

Plotpoint's pre-release contracts accumulated generation labels in TypeScript names, schema names,
logical IDs, catalog paths, report names, and design-document filenames. Aggregate schemas also
carried independent numeric versions even though an immutable release already inventories the exact
schema bytes and their digests.

Those distributed labels imply compatibility promises and migration paths that do not exist. They
also make related interfaces appear independently evolvable before product evidence has established
such a need. The project owner has explicitly directed Plotpoint to use plain names and to introduce
one centralized compatibility mechanism if incompatible evolution is required later.

## Decision

1. Repository-owned interfaces, types, schemas, commands, components, mechanics, reports, logical IDs,
   catalog paths, and contract filenames use plain stable names. They do not embed generation suffixes.
2. Aggregate and payload schemas are identified by a logical schema ID plus the exact bytes and digest
   inventoried by an immutable release. Aggregates and schema references do not carry independent
   schema-generation counters. `stateVersion` remains the aggregate concurrency and commit counter.
3. Existing format and boundary compatibility metadata remains owned by its centralized surface:
   project format, release format, Host API and capability negotiation, and the HTTP route boundary.
   These values do not alter the plain names of the interfaces and schemas they transport.
4. Before Plotpoint supports an incompatible interface or schema evolution, an Accepted ADR must
   define one centralized compatibility policy at the installation or negotiation boundary. The
   project must not pre-empt that decision with per-contract counters, parallel suffixed exports,
   aliases, or duplicated compatibility matrices.
5. Feature 0005 is a clean pre-release break. It removes the distributed labels and schema-generation
   fields, rejects discarded shapes, recompiles every valid fixture, and adds no legacy parser,
   migration, or alias.
6. This decision replaces only the distributed naming and independent aggregate-schema-version
   provisions in ADRs 0001 through 0005. Their release integrity, trust, persistence, authority,
   synchronization, and recovery boundaries remain Accepted.

## Consequences

- Public code and design artifacts have one obvious name for each concept.
- Exact schema agreement remains deterministic through immutable release identity, schema ID, and
  payload digest rather than a second per-schema generation number.
- Release-format and Host API compatibility checks remain centralized and explicit.
- A future breaking evolution requires a deliberate central design; this ADR does not build that
  speculative mechanism.
- Historical completed-feature artifacts may retain the terminology that described their delivered
  state, but active contracts and implementation surfaces migrate to the plain names in Feature 0005.

## Supersession

**Supersedes**: None
**Superseded by**: None
