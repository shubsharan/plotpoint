---
status: Accepted
---

# ADR: Unversioned Contract Names

## Context

Plotpoint has accumulated generation labels in TypeScript symbols, schema and command identifiers,
filenames, catalog paths, report names, and prose. Appending a generation to a semantic name makes the
first definition look like one member of a compatibility family even when no second generation
exists.

This spreads version policy across every package and game. Changing a suffix does not by itself define
compatibility, migration, parser selection, or coexistence, while repeating the label in symbols and
IDs makes the ordinary API harder to read. Immutable releases already pin exact bytes, schema digests
identify exact schema material, and serialized boundaries already carry explicit format or protocol
metadata where compatibility decisions are actually required.

## Decision

1. Public and repository-owned interfaces, types, functions, constants, and validators use plain
   semantic names. Generation numbers and compatibility aliases are not part of symbol names.
2. Schema, command, component, content, progression, mechanic, and other game-defined identifiers use
   stable semantic IDs without embedded generation suffixes. Exact release identity and inventoried
   schema digests bind an ID to its material.
3. Contract documents, catalog entries, test names, and fixed release paths use semantic names without
   a generation suffix. For example, the composition catalog is `composition/game.json`.
4. Numeric compatibility metadata remains only at a serialized boundary that must select a parser or
   reject incompatible data. Those values are owned by one protocol-level contract-version registry
   rather than repeated as naming conventions. Existing state and protocol version fields remain when
   they carry real concurrency or compatibility meaning.
5. A future incompatible format may add a centrally registered compatibility generation and explicit
   migration/coexistence rules. It does not rename every interface or schema. Git history is sufficient
   for ordinary in-place evolution before such a boundary exists.
6. No suffixed compatibility aliases are retained. This repository has no external consumer that
   requires the old pre-release names, so the change is a clean break.

## Consequences

- APIs and authored game identifiers become shorter and describe meaning rather than chronology.
- Version policy becomes inspectable in one protocol registry and at true serialization boundaries.
- Existing source, fixtures, examples, contract filenames, imports, and links must be renamed together.
- A future incompatible change requires an explicit compatibility design instead of mechanically
  appending a generation suffix.
- Serialized version fields are not removed merely because their TypeScript type is renamed; they must
  be evaluated by the centralized compatibility policy.

## Supersession

**Supersedes**: None
**Superseded by**: None
