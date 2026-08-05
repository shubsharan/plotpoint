---
status: Accepted
---

# ADR: Immutable Release Format

## Context

Gate 2 creates Plotpoint's first artifact that crosses from an authoring environment into later
player, registry, and installation workflows. Its bytes, manifest, compatibility declarations, and
identity become a public persisted contract. The compiler must also inspect Gate 1 command and
progression definitions without weakening the rule that arbitrary game code never executes inside a
platform API or worker process.

Ordinary archive defaults include timestamps, permissions, compression variance, path ambiguity,
and duplicate-entry behavior that would make byte identity or verification environment-dependent.
Putting release identity inside the artifact would be self-referential, while trusting only internal
entry hashes would not detect a coordinated replacement of the manifest and payloads.

## Decision

1. Authoring starts from a strict, data-only `plotpoint.project.json`. It explicitly
   identifies code entries and command, schema, progression, component, content, and asset
   registrations. It contains no project identity, release label, channel, timestamp, or registry
   metadata. Capability requirements are derived from the selected registrations.
2. The compiler snapshots every selected byte once, enforces closed deterministic-logic and
   browser-presentation import graphs, and bundles only captured local files and exact first-party
   package roots. Changes to live project files after coherent capture cannot affect or invalidate
   that build. It may evaluate selected Gate 1 definition modules only in a bounded local build
   subprocess after import validation, and it never invokes handlers or progression predicates. This
   is process isolation, not a hostile-code sandbox; hosted compilation requires a separately accepted
   isolated-executor design.
3. Build-time source inspection does not claim to prove absence of ambient clock, randomness,
   network, storage, or device authority. JavaScript syntax checks may provide advisory authoring
   feedback, but runtime authority is enforced by the future execution realm, host policy, and
   capability bridge. Gate 3 must accept an isolation ADR before executing release bundles.
4. The centrally registered release-format compatibility value selects one `.pprelease` file using
   a strict ZIP-compatible profile: stored
   entries only, canonical ASCII paths, ordinal entry order, fixed metadata, and no compression,
   encryption, symlinks, directory entries, comments, extra fields, data descriptors, ZIP64, source
   timestamps, ownership, permissions, or absolute paths.
5. `manifest.json` is RFC 8785 canonical JSON. It declares the release-format version, bounded host
   API requirement, exact aggregate schema versions, derived capability requirements, runtime entry
   roles, and an exact ordered inventory of every non-manifest entry with kind, byte length, and
   SHA-256 payload digest. Extra, missing, duplicate, or non-canonical entries are invalid.
6. A release identity is `sha256:<64 lowercase hexadecimal characters>` over every finalized
   `.pprelease` byte. The identity is returned and stored externally; it is not embedded in the
   artifact or manifest. Operational metadata is absent from the artifact, not merely excluded from
   a sub-digest.
7. Non-executing verification validates the strict container, canonical manifest, exact inventory,
   entry lengths and digests, and complete artifact identity. Internal consistency alone does not
   prove authenticity: tamper detection requires a trusted expected release identity supplied by a
   registry, installation request, or caller. Publisher signing remains outside Gate 2.
8. Release format, host API, and aggregate schema compatibility remain independent. Release-format
   is exact; host API compatibility uses an exact major plus minimum minor; aggregate schemas use
   an exact kind, schema identity, and positive integer version.
9. `@plotpoint/protocol` owns release construction, manifest and container semantics, immutable entry
   access, inspection, verification, identity, and compatibility. The compiler supplies validated
   material entries and metadata through one high-level constructor and owns project validation,
   graph analysis, composition, bundling, and same-filesystem atomic publication. A player consumes
   protocol contracts and never depends on the compiler.
10. Raw ZIP, CRC-32, canonical-JSON, manifest-validator, archive-path, and payload-digest primitives
    are protocol internals rather than public package-root compatibility surfaces. The compiler passes
    normalized validation outputs forward instead of recomputing them or repeating prerequisite
    validation.

## Consequences

- The artifact is intentionally uncompressed. Compression or another container encoding requires an
  explicit centralized compatibility decision rather than a renamed interface or silently changed
  bytes.
- Declarative registration duplicates some source-level identifiers, but it keeps project discovery
  inspectable and lets the compiler diagnose drift without executing handlers.
- Build subprocess isolation limits accidental contamination but does not make untrusted hosted
  compilation safe. The initial compiler is an author-controlled local tool.
- Static source inspection does not overclaim a determinism or security property it cannot prove;
  runtime isolation is an explicit Gate 3 prerequisite.
- Whole-file identity makes every encoding choice material and requires the trusted expected identity
  to live outside the artifact.
- The portable protocol surface becomes a smaller compatibility obligation for future players and
  tools while still providing verified entry access.
- Removing post-capture rereads permits authors to edit live source while a coherent captured build
  finishes; reproducibility continues to depend on captured bytes and a pinned toolchain.
- Feature 0002 implementation must preserve this accepted format and trust boundary; changing it
  requires a superseding ADR.

## Supersession

**Supersedes**: None
**Superseded by**: None
