---
status: Done
---

# Feature Specification: Immutable Release Pipeline

**Branch**: `feature/0002-immutable-release-pipeline`
**Epic**: [Plotpoint Core Platform](../../epics/0001-plotpoint-core-platform/epic.md)
**PR**: [https://github.com/shubsharan/plotpoint/pull/2](https://github.com/shubsharan/plotpoint/pull/2)
**Created**: 2026-08-03
**Input**: Feature 2 from `docs/roadmap.md` and `docs/product.md`.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Compile a Complete Immutable Release (Priority: P1)

A game author can submit a frozen external game project for validation and compilation and receive one complete release artifact containing everything required for later installation and play. The artifact has an identity derived from its emitted bytes and does not depend on mutable project files after compilation.

**Why this priority**: A complete, immutable handoff between game development and runtime execution is the core outcome of Gate 2 and the prerequisite for every player installation and authoritative release workflow.

**Independent Test**: Compile an external-consumer-style example project, remove access to its source and development dependencies, and inspect the resulting artifact. This slice is complete when the artifact contains the resolved game logic, presentation, content, progression, schemas, assets, and compatibility declarations and its identity matches its emitted bytes.

**Acceptance Scenarios**:

1. **Given** a valid frozen game project and a pinned build environment, **When** the author compiles it repeatedly, **Then** each run emits byte-identical release content with the same content-derived identity.
2. **Given** a successfully compiled release, **When** the project source, package discovery, and dependency resolution are unavailable, **Then** the release remains complete and inspectable for later installation and play.
3. **Given** a project that selects game modules, presentation components, content, schemas, and assets, **When** compilation succeeds, **Then** every selected item is resolved into the release rather than deferred to play time.
4. **Given** a coherent project snapshot, **When** the author edits live source after capture, **Then** the build completes from captured bytes without mixing or rereading the later edits.

---

### User Story 2 - Reject Invalid Projects Before Publication (Priority: P2)

A game author receives explicit validation failures before an invalid project can become a publishable release. Failures identify the project item and rule involved so the author can correct configuration, imports, commands, schemas, progression, components, content, or assets without debugging a player installation.

**Why this priority**: Early, actionable rejection prevents incomplete or incompatible game versions from entering release workflows and makes the compiler a trustworthy boundary rather than a packaging convenience.

**Independent Test**: Attempt to compile a fixture set containing one defect per supported validation class. This slice is complete when every defect prevents release eligibility, identifies its source location or logical reference, and emits no success-shaped artifact.

**Acceptance Scenarios**:

1. **Given** a project with an import forbidden in its declared execution environment, **When** validation runs, **Then** the project is rejected with the offending import and environment boundary identified.
2. **Given** a project with an invalid command registration or aggregate schema, **When** validation runs, **Then** the project is rejected before any release is eligible for publication.
3. **Given** missing content, an unknown progression target, an unresolved presentation component, or a missing asset, **When** compilation runs, **Then** it fails with diagnostics that identify every independently discoverable blocking reference.
4. **Given** a failed validation or compilation, **When** outputs are inspected, **Then** no output is presented as a valid content-addressed release.
5. **Given** equivalent direct, aliased, destructured, or computed access to an ambient browser or language global, **When** compilation runs, **Then** the compiler does not claim that syntax inspection proves runtime authority isolation.

---

### User Story 3 - Inspect Compatibility and Capability Requirements (Priority: P3)

A release operator or downstream player can inspect a release before installation and determine its release-format requirement, host-API requirement, aggregate-schema requirements, declared native capabilities, and integrity metadata without executing game code.

**Why this priority**: Installation and operation must be able to reject incompatible or unsupported releases safely. Those decisions require explicit, bounded metadata rather than inference from bundled game behavior.

**Independent Test**: Inspect the manifest from a golden release fixture without executing its game logic. This slice is complete when all compatibility, capability, content inventory, and integrity decisions can be made from the release metadata alone.

**Acceptance Scenarios**:

1. **Given** a valid compiled release, **When** its manifest is inspected, **Then** it declares the release format, required host API, aggregate schema versions, required native capabilities, and integrity information for all protected release content.
2. **Given** a project that requires an undeclared capability or an unsupported compatibility requirement, **When** compilation runs, **Then** it fails before producing a publishable release.
3. **Given** two releases with identical emitted content but different registry labels, channels, project identity, or creation timestamps, **When** their content identities are compared, **Then** those operational values do not change the content identity.
4. **Given** a structurally valid release, **When** a downstream consumer opens it, **Then** every inventoried entry is available as immutable bytes without executing game code or using compiler internals.

---

### User Story 4 - Detect Release Tampering (Priority: P4)

A release operator or downstream player can verify that a release is internally consistent and detect any alteration to its manifest, executable bundles, compiled content, schemas, or assets before trusting it.

**Why this priority**: Content-derived identity is useful only when all material release content is covered and alterations are detected before installation or execution.

**Independent Test**: Alter each protected class of content in a golden release fixture one at a time. This slice is complete when every alteration fails verification and the reported diagnostic identifies the affected release entry.

**Acceptance Scenarios**:

1. **Given** an unmodified compiled release, **When** integrity verification runs, **Then** all protected entries and the complete release identity verify successfully.
2. **Given** an altered manifest, bundle, compiled content item, schema, or asset, **When** integrity verification runs, **Then** the release is rejected and the affected entry is identified.
3. **Given** a release with a missing or unexpected protected entry, **When** integrity verification runs, **Then** the release is rejected rather than accepted as a partial or extended variant.

### Edge Cases

- The project configuration is missing, malformed, selects an unknown environment, or contains conflicting composition choices.
- Two selected modules, commands, schemas, components, content items, or assets claim the same release identity or destination.
- A valid source reference resolves outside the permitted project boundary or resolves differently through an alias, symbolic link, or case variation.
- The import graph contains a cycle, a dynamically unresolved dependency, or a dependency allowed for authoring but forbidden in the target runtime environment.
- Game code aliases, destructures, or computes access to ambient clock, randomness, network, storage, or device globals that syntax-pattern matching cannot soundly classify.
- A command registration references an unknown aggregate schema version, or two registrations conflict for the same command identity.
- A progression graph references missing content or components, contains invalid node references, or conflicts with the deterministic runtime contract.
- An asset is empty, unreadable, changes during compilation, or is referenced under multiple equivalent paths.
- Operational metadata such as labels, channels, project identity, or timestamps changes while the protected release content remains identical.
- A build is interrupted after validation or during emission and leaves partial output behind.
- Verification encounters a missing, extra, reordered, truncated, or altered release entry.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The pipeline MUST accept a game project configuration that identifies the target execution environment and the game logic, presentation, content, modules, schemas, and assets selected for the release.
- **FR-002**: The pipeline MUST validate the project configuration before treating any compilation output as a release.
- **FR-003**: The pipeline MUST enforce a closed import graph for the declared execution environment and reject unresolved imports, forbidden package roots, native addons, URL imports, CommonJS loading, and non-literal dynamic imports.
- **FR-004**: The pipeline MUST resolve all selected modules, presentation components, content, schemas, progression definitions, and assets at build time.
- **FR-005**: The pipeline MUST reject unresolved, ambiguous, duplicate, conflicting, or out-of-bound project references with diagnostics that identify the relevant configuration field or source reference.
- **FR-006**: The pipeline MUST validate command registrations against the deterministic runtime contract, including command identity, target aggregate kind, expected schema, and referenced outcomes.
- **FR-007**: The pipeline MUST validate every player, team, and session aggregate schema included in the release and reject unsupported durable values or incompatible schema references.
- **FR-008**: The pipeline MUST validate progression definitions, including node identity, content references, transition targets, command references, component references, and aggregate dependencies.
- **FR-009**: The pipeline MUST validate that every content, component, and asset reference resolves to exactly one included release entry.
- **FR-010**: The pipeline MUST derive the release's declared native capability requirements from the compiled project and MUST reject requirements that are missing, contradictory, or outside the supported declaration model.
- **FR-011**: A successful compilation MUST emit one self-contained release artifact containing the game logic, presentation, compiled content and progression, aggregate schemas, assets, capability declarations, and integrity metadata required for later installation and play.
- **FR-012**: The emitted release MUST NOT require access to project source, authoring-only packages, package discovery, or dependency resolution during play.
- **FR-013**: Every release MUST contain a manifest that inventories its protected entries and declares centrally registered release and host compatibility metadata, aggregate-schema identities and digests, and native capability requirements.
- **FR-014**: The pipeline MUST compute integrity metadata for the manifest and every material bundle, content item, schema, and asset included in the release.
- **FR-015**: The release identity MUST be derived from the complete emitted byte content covered by the release format.
- **FR-016**: Project identity, release labels, release channels, creation timestamps, and other registry metadata MUST remain outside the content-derived release identity.
- **FR-017**: Given the same frozen project inputs and pinned build environment, repeated compilation MUST emit byte-identical protected release content and the same release identity.
- **FR-018**: Integrity verification MUST reject any missing, unexpected, truncated, or altered protected entry and MUST identify the entry or manifest relationship that failed verification.
- **FR-019**: A validation, resolution, compilation, or integrity failure MUST prevent the output from being represented as a valid or publishable release.
- **FR-020**: Failed or interrupted compilation MUST NOT leave a partial artifact that can be mistaken for a completed release.
- **FR-021**: Diagnostics MUST distinguish configuration, import-boundary, composition, command, schema, progression, component, content, asset, compatibility, and integrity failures and include enough context for an author to locate the defect.
- **FR-022**: The pipeline MUST support golden fixtures that consume the author-facing project surface from outside the platform workspace and exercise complete valid releases and each required failure class.
- **FR-023**: A release operator or downstream installer MUST be able to inspect manifest, compatibility, capability, inventory, identity, and integrity information without executing bundled game code.
- **FR-024**: Release, Host API, and aggregate-schema compatibility requirements MUST be evaluated explicitly through centralized metadata and schema identity rather than embedded name suffixes.
- **FR-025**: A downstream installer MUST be able to read every verified inventoried entry through the portable release interface without compiler internals or filesystem extraction.
- **FR-026**: Compilation MUST NOT represent syntax-pattern inspection as proof that bundled JavaScript lacks ambient authority; runtime authority isolation belongs to the execution host.
- **FR-027**: Once a coherent compilation snapshot is captured, subsequent compilation MUST use only captured bytes and MUST NOT fail solely because live project files later change.
- **FR-028**: Release construction, entry access, inspection, verification, identity, and compatibility MUST share one portable format authority so callers cannot produce or consume release bytes through divergent rules.

### Key Entities

- **Game Project Configuration**: The author-controlled declaration of target environment and selected game logic, presentation, content, modules, schemas, progression, assets, and required capabilities.
- **Compilation Input Set**: The frozen project files, resolved dependencies, selected environment, and pinned build environment that determine emitted release content.
- **Release Artifact**: The complete immutable unit prepared for publication and later installation, containing all game-specific runtime material and integrity information.
- **Release Manifest**: The inspectable inventory of protected release entries and their compatibility, capability, schema, and integrity declarations.
- **Release Entry**: A material bundle, content item, progression definition, schema, component, or asset included in and protected by the release.
- **Opened Release**: A completely validated release view that exposes immutable copies of every inventoried entry without executing them.
- **Content Identity**: The identity derived from the emitted bytes governed by the release format; it excludes mutable registry and operational metadata.
- **Compatibility Requirement**: A release-format, Host API, or aggregate-schema requirement that a downstream installer can evaluate before play from centralized metadata and schema identity.
- **Capability Declaration**: The set of native host capabilities the compiled game requires, expressed for inspection before installation.
- **Validation Diagnostic**: A classified explanation of a configuration, import, composition, reference, compatibility, or integrity defect and its project or release location.
- **Golden Release Fixture**: An external-consumer-style project and its expected artifact or expected validation failure used as acceptance evidence.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: For every representative valid golden project, 20 consecutive compilations from the same frozen inputs and pinned build environment produce byte-identical protected release content and one identical content-derived identity.
- **SC-002**: 100% of valid golden releases can be fully inventoried and inspected for compatibility, capabilities, schemas, identity, and integrity without access to project source or execution of bundled game code.
- **SC-003**: 100% of required invalid fixture classes are rejected before release eligibility, with no partial output recognizable as a completed release.
- **SC-004**: 100% of single-entry tampering cases across manifests, bundles, compiled content, schemas, components, and assets are detected before installation, and each diagnostic identifies the affected entry or relationship.
- **SC-005**: 100% of golden releases remain complete when project source, authoring-only packages, package discovery, and dependency resolution are unavailable.
- **SC-006**: Changing only a release label, channel, project identity, or creation timestamp changes zero content-derived release identities across the golden fixture suite.
- **SC-007**: In author usability validation, at least 90% of seeded configuration, import, reference, schema, progression, component, and asset defects are located from the first reported diagnostic without inspecting compiler internals.
- **SC-008**: The golden fixture suite includes at least three materially different valid external projects and at least one isolated failure fixture for every validation category named in FR-021.
- **SC-009**: 100% of verified inventory entries in every golden release can be read through the portable release interface after project source and authoring dependencies are removed.
- **SC-010**: Direct, aliased, destructured, and computed ambient-global examples receive no false claim of runtime isolation from compilation alone.
- **SC-011**: A live-source mutation after coherent capture changes zero bytes in the in-progress artifact and does not invalidate that captured build.

## Assumptions

- This feature covers Gate 2 of the product roadmap and depends on the completed deterministic runtime contract from Gate 1.
- The feature ends with a complete artifact prepared for publication; registry storage, channels, publication authorization, player installation, and session pinning belong to later features.
- The exact project configuration syntax, release container encoding, manifest field names, digest algorithm, compiler package boundaries, and command-line interface are planning decisions rather than specification requirements.
- Reproducibility is required for frozen inputs under a pinned build environment. A fully hermetic toolchain, software bill of materials, and third-party module signing remain outside the initial roadmap.
- Release content is trusted only after integrity verification. Authenticating the publisher or establishing a signing trust chain is outside this feature.
- Module and component composition is static. Runtime package discovery, third-party module distribution, and a component marketplace are outside this feature.
- The pipeline validates game-authored material but does not execute arbitrary game-authored code inside platform service processes.
- Runtime enforcement of deterministic-logic and presentation authority is a Gate 3 host responsibility governed by a future accepted isolation ADR; Gate 2 enforces only the closed import graph it can prove.
- Active-session release migration is outside this feature; mutable registry labels and channels do not alter an existing artifact or its content identity.

## Architecture Decisions

- [Deterministic Runtime Contract](../../adrs/0001-deterministic-runtime-contract.md)
- [Immutable Release Format](../../adrs/0002-immutable-release-format.md)
- [Centralized Contract Evolution](../../adrs/0006-centralized-contract-evolution.md)
