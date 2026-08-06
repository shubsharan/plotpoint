# Implementation Plan: Immutable Release Pipeline

**Branch**: `feature/0002-immutable-release-pipeline` | **Date**: 2026-08-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `docs/features/0002-immutable-release-pipeline/spec.md`

## Summary

Implement the Gate 2 authoring boundary in the existing compiler and protocol packages. A strict
data-only project descriptor selects code and data; the compiler snapshots its complete input graph
once, enforces separate closed deterministic-logic and browser-presentation import policies, validates Gate 1
definitions and cross-references, generates two self-contained browser ESM bundles through pinned
Rolldown's stable `rolldown()` and `bundle.generate()` APIs, and atomically publishes one deterministic
`.pprelease` artifact. The portable protocol package owns high-level release construction, the strict
release-format container, canonical manifest, exact-byte SHA-256 identity, immutable verified entry
access, non-executing inspection, integrity verification, and compatibility assessment. Ambient
authority is enforced by the future runtime host rather than overclaimed through syntax matching.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript 7.0.2 with strict checking, ESM, and ES2022 output; Node.js 25 or newer for author builds
**Primary Dependencies**: Existing `@plotpoint/runtime`, `@plotpoint/modules`, and `@plotpoint/protocol`; direct pinned compiler dependencies Rolldown 1.2.2 through its stable Rollup-compatible API, `oxc-parser` 0.143.0, and Ajv 8.20.0; portable SHA-256 through `@noble/hashes` 2.2.0
**Storage**: Project files captured into an in-memory compilation snapshot; one temporary and one finalized `.pprelease` file; no database or registry storage
**Testing**: Vitest 4.1 named compiler and protocol projects; type-facing tests; deterministic unit and contract cases; external-consumer golden projects; mutation, interruption, and 20-run byte-reproducibility matrices
**Target Platform**: Node.js authoring/compiler CLI; portable ES2022 protocol library; emitted browser ESM bundles for the future web runtime
**Project Type**: Monorepo compiler, portable protocol library, CLI, and external example fixtures
**Performance Goals**: Correctness, bounded parsing, and byte determinism are the Gate 2 goals; record build and verification baselines without creating a speculative latency gate
**Constraints**: Data-only configuration; no runtime package discovery; no author Rolldown plugins or config files; use `rolldown()` plus in-memory `bundle.generate()` rather than experimental `build()` or filesystem `write()`; no final external imports; compiler guarantees only the closed import graph while Gate 3 owns ambient-authority isolation; no game handler or rule execution during compilation; exact ordinal ordering; coherent capture defines the build input; store-only non-ZIP64 release format; no operational metadata in artifact bytes; atomic non-overwriting output; expected identity required for a tamper claim
**Scale/Scope**: At least three materially different valid external projects plus one isolated fixture for every diagnostic category; two emitted code bundles and explicit content/schema/component/asset entries; player installation, registry publication, signing, compression, active-session migration, and hosted untrusted compilation are excluded

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

The repository constitution is still an unratified placeholder, so it provides no enforceable
project principles. The active product invariants, Feature 0002 requirements, and accepted runtime
ADR therefore provide the planning gates.

### Pre-Research Gate

- **PASS - Immutable handoff**: One finalized artifact contains all play-time game material and needs no source discovery.
- **PASS - Honest runtime boundary**: Logic imports are closed and analyzed separately, while absence of ambient authority is reserved for a future isolated execution host rather than inferred from syntax spellings.
- **PASS - Build-time composition**: Commands, schemas, progression, components, content, and assets resolve before artifact publication; no mutable runtime registry is introduced.
- **PASS - Independent compatibility**: Release format, host API, and aggregate schema versions remain separate manifest fields.
- **PASS - Security honesty**: Local definition inspection is bounded process isolation, not a claim of hostile-code sandboxing or safe hosted compilation.
- **PASS - Minimal ownership**: Existing compiler and protocol packages are sufficient; protocol owns one high-level release constructor and verified reader without a new package, service, datastore, or queue.

### Post-Design Gate

- **PASS - Exact byte identity**: The whole strict container is hashed, and the identity is external to avoid self-reference.
- **PASS - Non-executing inspection**: Manifest, inventory, compatibility, capabilities, and integrity can be assessed without executing game bundles or extracting them to the filesystem.
- **PASS - Complete integrity boundary**: Canonical manifest inventory plus an expected outer identity covers missing, extra, reordered, and altered bytes honestly.
- **PASS - Atomic publication**: Invalid or interrupted builds cannot leave a success-shaped release at the requested output path.
- **PASS - Operational separation**: Project identity, labels, channels, timestamps, receipts, and telemetry stay outside every content-addressed byte.
- **PASS - Scope discipline**: Compression, signing, module marketplace semantics, player installation, registry operations, and hosted build isolation remain later decisions.

No gate violation requires a complexity exception.

## Architecture Decisions

**Impact**: Major

- [Deterministic Runtime Contract](../../adrs/0001-deterministic-runtime-contract.md) - **Accepted**. Governs the command, aggregate, progression, canonical-value, and ambient-authority definitions that compilation validates and bundles.
- [Immutable Release Format](../../adrs/0002-immutable-release-format.md) - **Accepted**. Governs project composition, closed-import enforcement, future runtime authority isolation, release-format bytes, high-level construction and entry access, manifest and identity semantics, compatibility, verification, package ownership, and atomic publication.
- [Centralized Contract Evolution](../../adrs/0006-centralized-contract-evolution.md) - **Accepted**. Governs plain public symbols, semantic identifiers, and centralized serialized compatibility metadata.

<!-- Use `Impact: Major` and link every governing ADR here and in spec.md. -->

## Project Structure

### Documentation (this feature)

```text
docs/features/0002-immutable-release-pipeline/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── project-configuration.md
│   ├── compiler-api.md
│   └── release-format.md
├── checklists/
│   └── requirements.md
└── tasks.md                 # Created by /speckit-tasks after ADR acceptance
```

### Source Code (repository root)

<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
packages/protocol/
├── src/
│   ├── index.ts
│   └── release/
│       ├── types.ts
│       ├── canonical-json.ts
│       ├── paths.ts
│       ├── zip-profile.ts
│       ├── manifest.ts
│       ├── identity.ts
│       ├── create.ts
│       ├── open.ts
│       ├── inspect.ts
│       ├── verify.ts
│       └── compatibility.ts
└── test/
    ├── release-format.test.ts
    ├── manifest.test.ts
    ├── verification.test.ts
    ├── compatibility.test.ts
    └── public-api.test.ts

packages/compiler/
├── src/
│   ├── index.ts
│   ├── cli.ts
│   ├── project/{config,load-project,path-policy,snapshot}.ts
│   ├── imports/{analyze-source,environment-policy,resolve-graph}.ts
│   ├── composition/{registries,generated-entries,inspect-definitions,validate-references}.ts
│   ├── validation/{commands,schemas,progression,components,content,assets,capabilities}.ts
│   ├── bundle/{bundle-release,rolldown-plugin}.ts
│   ├── diagnostics/{codes,create,order,render}.ts
│   └── release/{assemble,atomic-output}.ts
└── test/
    ├── unit/
    ├── contract/
    ├── integration/
    └── fixtures/projects/{valid,invalid}/

examples/releases/
├── minimal-local-puzzle/
├── branching-media-tour/
└── co-op-game/

vitest.config.ts
package.json
turbo.json
```

**Structure Decision**: Extend the existing `@plotpoint/protocol` package with the portable persisted
format, high-level constructor, verified reader, and verifier, and the existing `@plotpoint/compiler`
package with the Node authoring pipeline and CLI. Raw container/canonicalization primitives remain
private. Runtime remains unchanged; protocol removes its unused runtime dependency.
Modules remain first-party source material rather than becoming a runtime registry. Golden examples
are copied outside the workspace for acceptance tests so public exports and source independence are
proven rather than assumed.

## Phase 0: Research

Research is complete in [research.md](research.md). It resolves configuration, closed import analysis,
definition inspection, schema dialect, deterministic bundling, container encoding, identity,
manifest construction and entry access, verification, compatibility, diagnostics, atomic output,
snapshot semantics, package ownership, and golden evidence without remaining clarification markers.

## Phase 1: Design & Contracts

- [data-model.md](data-model.md) defines project, snapshot, registries, entries, manifest, artifact, identity, diagnostics, and compilation lifecycles.
- [project-configuration.md](contracts/project-configuration.md) fixes the strict declarative authoring and environment-boundary contract.
- [compiler-api.md](contracts/compiler-api.md) fixes validation, compilation, diagnostics, CLI, subprocess, and atomic-output behavior.
- [release-format.md](contracts/release-format.md) fixes canonical bytes, manifest, identity, inspection, verification, and compatibility semantics.
- [quickstart.md](quickstart.md) demonstrates validation, compilation, source-free inspection, byte reproducibility, and tamper rejection as an external consumer.
- The Spec Kit block in `AGENTS.md` points to this plan so subsequent task generation and implementation load the Gate 2 decisions.

## Phase 2: Implementation Planning

Implementation tasks are defined in [tasks.md](tasks.md) and may proceed under accepted ADR 0002.
They preserve dependency order: protocol primitives and format; project snapshot and diagnostics;
import/schema/composition validation; definition inspection and bundling; artifact assembly and atomic
publication; CLI/public exports; then external golden and mutation evidence.
