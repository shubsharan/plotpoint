# Research: Immutable Release Pipeline

## Refinement: Authority Enforcement Boundary

**Decision**: The compiler soundly enforces a closed import graph but does not treat syntactic matching
of ambient globals as proof of runtime isolation. Direct, aliased, destructured, and computed global
access are all runtime concerns. Gate 3 must provide an isolated execution realm, host policy, and
capability bridge before release bundles execute.

**Rationale**: JavaScript source spellings are not a security boundary. A pattern blacklist creates
both false confidence and inconsistent behavior for semantically equivalent code, while the compiler's
snapshot-backed resolver can soundly prove that every bundled import belongs to the captured graph.

**Alternatives considered**: Expand the blacklist with alias tracking, computed-property handling, and
scope analysis. Rejected because it remains incomplete for a dynamic language and duplicates the
runtime boundary that must exist regardless.

## Refinement: Portable Construction and Entry Access

**Decision**: Protocol owns one high-level release constructor and one verified release reader. Raw
ZIP, CRC, canonical JSON, manifest validation, path, and payload digest primitives remain internal.

**Rationale**: The package that defines persisted bytes should construct and read them through the same
invariants. A future player needs verified entry bytes, not a public archive writer. This also removes
the compiler's format self-round-trip and shrinks the public compatibility surface.

**Alternatives considered**: Keep construction in compiler and export the ZIP parser. Rejected because
it exposes encoding internals, splits ownership, and encourages callers to bypass full verification.

## Refinement: Snapshot and Validation Flow

**Decision**: Coherent capture is the immutable build boundary. The compiler performs before/read/after
checks during capture, then uses captured bytes without rereading live files. Normalized capabilities
and prerequisite reference validation flow forward rather than being recomputed by assembly or
specialized validators.

**Rationale**: Later live edits cannot alter captured bytes. Post-capture rereads add filesystem work,
create false failures, and weaken the snapshot abstraction. Passing validated outputs forward removes
duplicate logic and impossible defensive branches.

**Alternatives considered**: Retain fingerprints and revalidate at each phase. Rejected because it
checks mutable workspace state rather than artifact coherence.

## Declarative Project Configuration

**Decision**: Use one strict, data-only `plotpoint.project.json` with explicit code exports and explicit schema, progression, component, content, and asset registrations. Reject unknown keys, globs, package discovery, executable configuration, project-boundary escapes, aliases, symlinks, and case-equivalent duplicate destinations. Derive capability requirements from selected registrations.

**Rationale**: The compiler can enumerate and snapshot every material input without executing configuration code or depending on filesystem discovery order. JSON-pointer diagnostics remain stable and author choices stay inspectable.

**Alternatives considered**: Executable TypeScript configuration was rejected because top-level code adds ambient authority and nondeterminism before validation. Package scanning and globs were rejected because they make the input set implicit. Source annotations alone were rejected because they become a bespoke evaluator and cannot describe assets or content cleanly.

## Input Snapshot

**Decision**: Resolve the explicit project graph, capture every material byte with pre/post file checks, and make all later analysis and bundling read the immutable snapshot through compiler-controlled loaders. Coherent capture is the final read of live project state.

**Rationale**: A build that rereads a live tree can mix versions even when its start and end revisions appear frozen. Snapshot ownership makes the pinned-input reproducibility claim testable and removes cwd, temporary path, clock, locale, and discovery order from output.

**Alternatives considered**: Reading the live tree throughout was rejected as vulnerable to torn builds. Normalizing raw media was rejected because authored bytes are material and must be preserved.

## Import Graphs and Environment Policy

**Decision**: Analyze deterministic logic and browser presentation as separate closed import graphs with a direct Oxc parser and Rolldown's resolver hooks. Both permit project-local ESM plus supported Plotpoint roots and reject Node/package imports outside that allowlist, CommonJS, URL imports, non-literal dynamic imports, native addons, unresolved imports, and externalized output. Ambient browser and language globals are not treated as a compiler-enforced authority boundary. Use fixed browser/import/default resolution conditions.

**Rationale**: AST analysis and the snapshot resolver soundly close the module graph. Separate entry roles preserve Gate 1 semantics and allow the future host to apply different runtime isolation without pretending syntax matching proves authority absence.

**Alternatives considered**: Rolldown hooks alone were rejected because explicit AST policy must also catch CommonJS, URL imports, native addons, and non-literal dynamic imports. The TypeScript compiler API was rejected because the installed TypeScript 7 API is not the stable bundler-resolution surface. Banning all ESM cycles was rejected as broader than the roadmap requires.

## Gate 1 Definition Inspection

**Decision**: Generate a validation entry for configured command and progression exports, bundle it only after import-policy validation, and evaluate it in a bounded local subprocess. Inspect static definition metadata and builder validation only; never invoke command handlers or progression predicates. Do not import author modules into the compiler process, API, or worker. Hosted compilation is out of scope until an isolated executor is accepted.

**Rationale**: Gate 1 definitions contain functions, so pure AST extraction would become a TypeScript interpreter and trusting duplicated configuration would permit drift. A subprocess gives a clear local operational boundary while honestly avoiding a hostile-code sandbox claim.

**Alternatives considered**: Compiler-process imports were rejected because author initialization would contaminate the caller. Pure static evaluation was rejected as incomplete for helpers and closures. Trusting config metadata was rejected because emitted definitions could disagree.

## Durable Schema Format

**Decision**: Store aggregate, command payload, and outcome schemas as canonical JSON Schema 2020-12 documents. Ajv is a compiler-only validator; its internal error shape is normalized into Plotpoint diagnostics. Restrict schemas to a closed JSON-compatible durable subset and associate aggregate schemas with exact kind and positive schema version.

**Rationale**: Runtime TypeScript types disappear after compilation, while installation and later validation need durable inspectable schema data. A constrained standard avoids inventing a schema language and does not add a runtime dependency.

**Alternatives considered**: Type inference from TypeScript was rejected because it does not provide durable runtime documents. A custom schema language was rejected as a new compatibility surface without evidence.

## Bundling

**Decision**: Use direct pinned Rolldown 1.2.2 through the stable Rollup-compatible `rolldown()` and `bundle.generate()` APIs, not the experimental convenience `build()` API or filesystem `bundle.write()`. Provide compiler-generated virtual logic and presentation roots, serve every module through one compiler-owned snapshot plugin, call `bundle.generate()` with fixed browser ESM/ES2022 output options, accept exactly the two named entry chunks, and close the bundle in `finally`. Disable code splitting, sourcemaps, minification, injected banners, author plugins, config-file discovery, and external imports.

**Rationale**: Rolldown provides modern Rust performance, Rollup/Vite-compatible `resolveId` and `load` hooks, direct in-memory output generation, and finer output control while remaining a standalone compiler primitive. Avoiding its convenience build/write paths keeps filesystem publication under Plotpoint's atomic-output boundary. Fixed options keep the pinned-toolchain byte claim narrow, and two named entry chunks preserve the logic/presentation boundary without speculative chunk graphs.

**Alternatives considered**: esbuild remains a mature fallback but was rejected as the default because Rolldown offers a more current plugin/output model for this compiler. Vite and tsdown were rejected as higher-level products with application or library-packaging conventions Plotpoint does not need. TypeScript emit was rejected because it does not create self-contained bundles. Code splitting was deferred until representative artifacts show a need.

## Deterministic Release Container

**Decision**: Release-format is one store-only ZIP-compatible `.pprelease` file with regular files, canonical ASCII paths, ordinal ordering, fixed metadata, and no compression, encryption, symlinks, directory entries, comments, extras, data descriptors, ZIP64, timestamps, ownership, permissions, or absolute/source paths.

**Rationale**: A standard container remains inspectable, while the strict profile eliminates host metadata and compressor variance. Store-only bytes keep simple and make every parser rule explicit.

**Alternatives considered**: General ZIP defaults were rejected as nondeterministic. Tar was rejected for additional platform header normalization and weaker random access. A custom container was rejected as unnecessary parser surface. Compression requires a later format version.

## Canonical Manifest and Inventory

**Decision**: Encode `manifest.json` as RFC 8785 canonical JSON in UTF-8 without BOM or trailing newline. Declare release format, host API requirement, aggregate schemas, derived capabilities, bundle entry roles, and an exact ordered inventory. Each non-manifest entry records path, kind, byte length, and SHA-256 payload digest; the manifest does not list itself.

**Rationale**: Exact inventory rejects omissions, extras, duplicates, and role ambiguity. Canonical cross-language bytes are safer than relying on an internal serializer whose persisted semantics were not previously public.

**Alternatives considered**: Pretty JSON was rejected because serializer whitespace varies. A self-entry was rejected as recursive. A general extension map was rejected because it would make compatibility and identity ambiguous.

## Content Identity

**Decision**: Identify a release as `sha256:<64 lowercase hex>` over every finalized artifact byte. Return and store the identity externally; never embed it in the artifact. Exclude labels, channels, project identity, timestamps, build host, source paths, telemetry, and output location from every artifact byte.

**Rationale**: Whole-file hashing makes container structures and manifest bytes material and exactly matches the product rule. External storage avoids impossible self-reference. Operational exclusion must happen before serialization because there is no unhashed region.

**Alternatives considered**: Manifest-only and logical Merkle identities were rejected because different emitted bytes could share an identity. Embedded identity was rejected as circular. Signing is outside Gate 2.

## Verification and Trust

**Decision**: Verify strict container structure, canonical manifest, exact path inventory, every entry length and digest, and the whole artifact identity without extraction or game execution. Require a trusted expected identity to assert that a known release was not replaced. Treat a coordinated manifest-plus-payload rewrite as a different internally consistent release, not as the same release.

**Rationale**: Internal hashes prove consistency but not authenticity. The external expected identity closes the known-release tamper boundary without overstating publisher trust.

**Alternatives considered**: Internal digests alone were rejected because an attacker can rewrite both sides. Extract-then-inspect was rejected as unnecessary filesystem exposure. Publisher signatures remain a separate decision.

## Compatibility

**Decision**: Keep three independent checks. Release format requires exact version support. Host API uses exact major and minimum minor. Aggregate schemas use exact schema identity, aggregate kind, and positive integer version.

**Rationale**: These surfaces evolve for different reasons. Narrow integer rules avoid general range parsing and prerelease ambiguity before evidence requires it.

**Alternatives considered**: One global version was rejected as coupling unrelated changes. General semantic-version ranges were rejected as unnecessary complexity.

## Diagnostics

**Decision**: Return expected author defects as stable compiler diagnostics with category, code, structured location, canonical details, and related locations. Collect independently discoverable errors within a phase, stop dependent phases after prerequisite failure, and sort by a fixed category rank and ordinal structured location. Render prose separately.

**Rationale**: Stable structured diagnostics are testable and reproducible while human wording can improve. Phase-aware collection gives useful breadth without cascading noise.

**Alternatives considered**: Reusing runtime diagnostic codes was rejected because compiler defects are a different surface. Fail-fast was rejected by the usability requirement. Message-text sorting was rejected as locale and presentation dependent.

## Atomic Publication

**Decision**: Assemble on the destination filesystem under a non-release temporary name, close and self-verify the complete artifact, then publish atomically without overwriting an unrelated destination. If the destination exists, accept it only when it independently verifies as the exact expected artifact. Return success only after publication.

**Rationale**: Completion becomes one observable transition. Interrupted or invalid work cannot be mistaken for a finalized release, and the compiler cannot bless bytes the consumer verifier rejects.

**Alternatives considered**: Streaming to the final path and multi-file output were rejected because partial success is visible. Blind overwrite was rejected because it can destroy unrelated or corrupted output.

## Package Ownership and Evidence

**Decision**: Put portable release types, strict container codec, inspection, verification, identity, and compatibility in `@plotpoint/protocol`; put Node project analysis, schema validation, bundling, definition inspection, assembly, publication, and CLI in `@plotpoint/compiler`. Copy golden projects outside workspace resolution for public-surface tests and cover 20 repeated builds, source removal, every diagnostic category, path attacks, interruption points, and coordinated tampering.

**Rationale**: Future players must consume releases without depending on the compiler. External copies catch deep imports and workspace aliases that in-repository fixtures hide.

**Alternatives considered**: Compiler-owned verification was rejected as the wrong downstream dependency. A new package was rejected because the existing boundaries already describe these responsibilities.
