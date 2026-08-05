# Contract: Compiler API and CLI

## Compatibility Surface

`@plotpoint/compiler` is the Node.js authoring surface. Expected project defects are returned as
typed invalid results; infrastructure failures and programmer misuse may throw. The compiler never
returns success or a release identity before the complete artifact is verified and published.

Only package-root exports are supported. Game projects never deep-import compiler internals.

## Programmatic API

```ts
interface ValidateProjectInput {
  readonly projectRoot: string;
  readonly configPath?: string;
}

interface CompileProjectInput extends ValidateProjectInput {
  readonly outputFile: string;
}

interface ValidatedProject {
  readonly kind: "valid";
  readonly manifestPreview: ReleaseManifest;
}

interface InvalidProject {
  readonly kind: "invalid";
  readonly diagnostics: readonly CompilerDiagnostic[];
}

interface CompiledProject {
  readonly kind: "compiled";
  readonly outputFile: string;
  readonly releaseId: ReleaseId;
  readonly manifest: ReleaseManifest;
}

export function validateProject(
  input: ValidateProjectInput,
): Promise<ValidatedProject | InvalidProject>;

export function compileProject(
  input: CompileProjectInput,
): Promise<CompiledProject | InvalidProject>;
```

`configPath` defaults to `<projectRoot>/plotpoint.project.json`. Both paths are resolved explicitly;
the current working directory and output filename do not influence artifact bytes.

## Compiler Diagnostic

```ts
type CompilerDiagnosticCategory =
  | "configuration"
  | "import-boundary"
  | "composition"
  | "command"
  | "schema"
  | "progression"
  | "component"
  | "content"
  | "asset"
  | "compatibility"
  | "integrity";

interface CompilerDiagnostic {
  readonly category: CompilerDiagnosticCategory;
  readonly code: string;
  readonly severity: "error";
  readonly location: DiagnosticLocation;
  readonly details: JsonObject;
  readonly related: readonly DiagnosticLocation[];
}
```

Locations are one of a configuration JSON pointer, normalized source path with one-based line and
column, logical registration, or artifact entry. Details contain canonical stable data, never a
stack, timestamp, cwd, temp path, or raw host error prose. Human text is rendered separately.

Diagnostics sort by fixed category rank, normalized path, pointer or line/column, code, and canonical
details. A phase collects all independently discoverable defects; a failed prerequisite suppresses
dependent work and cascading diagnostics.

## Pipeline Order

1. Resolve and parse the project file without execution.
2. Resolve explicit paths and coherently capture the immutable input snapshot once.
3. Parse and validate closed logic and presentation import graphs without claiming ambient-authority isolation.
4. Build canonical registries and validate all cross-references.
5. Validate schemas, content, components, assets, compatibility, and capabilities.
6. Bundle and inspect selected Gate 1 definitions in a bounded subprocess; never call handlers or predicates.
7. Generate deterministic logic and presentation roots, including canonical named registry maps, and
   bundle both from snapshot bytes in memory.
8. Pass normalized manifest metadata and material entries to the protocol release constructor.
9. Receive the canonical, self-verified artifact from protocol.
10. Publish atomically and return the release identity and manifest.

Any invalid result ends before later dependent phases and writes no completed release.

After coherent capture, the compiler never rereads live project inputs. Runtime isolation of clock,
randomness, network, storage, DOM, and device globals is explicitly outside the compiler contract.

## Definition Subprocess

The subprocess receives only the validated inspection bundle and a bounded result channel. It has a
time limit and output limit, runs outside the compiler process, and returns canonical static metadata.
It never invokes command handlers or progression predicates. Timeout, abnormal exit, invalid output,
or attempted forbidden import produces an invalid diagnostic. Returned metadata is validation
evidence only: release descriptors are assembled from canonical registrations, so observed ambient
values cannot influence release bytes or identity.

This boundary limits accidental process contamination; it is not a hostile-code sandbox. The local
author controls the project and compiler. An API, worker, or hosted build service must not use this
path for untrusted code without a future accepted isolation ADR.

## Bundling Contract

- The compiler calls pinned Rolldown through `rolldown(inputOptions)`, then calls
  `bundle.generate(outputOptions)` and always calls `bundle.close()` in `finally`.
- The experimental Rolldown `build()` convenience API, `bundle.write()`, config-file loading, watch
  mode, and author-provided plugins are not used.
- Compiler-generated virtual IDs are the only bundle entry points. One compiler-owned plugin uses
  `resolveId` to enforce the validated graph and `load` to return captured snapshot bytes; Rolldown
  never discovers or rereads author files independently.
- Both graphs emit browser ESM targeting ES2022.
- The output is one deterministic logic bundle and one deterministic presentation bundle.
- Code splitting, source maps, minification, author plugins, banners, absolute paths, timestamps,
  random chunk IDs, and final external imports are forbidden in.
- Output options fix entry names, format, target behavior, export shape, and chunking. Generation must
  return exactly the two expected entry chunks and no unplanned asset or shared chunk.
- Rolldown warnings and failures are normalized into Plotpoint diagnostics; raw tool-specific prose,
  absolute paths, timings, and plugin object shapes are not public compiler results.
- Generated registration roots order imports and map entries ordinally. The logic bundle retains its
  existing default export and additionally exports frozen `commands` and `progressions` maps keyed by
  registration ID. The presentation bundle retains its default export and additionally exports a
  frozen `components` map keyed by registration ID.

## Atomic Output

The requested output must use a `.pprelease` path. Assembly writes a sibling temporary file that does
not have a release extension, closes it, computes its identity, and verifies it through the consumer
verifier. Publication is a same-filesystem atomic rename that does not overwrite an unrelated path.

If the final path already exists, the compiler may return success only when that file independently
verifies as the exact artifact just produced. Otherwise it returns an output-collision diagnostic and
leaves the existing file unchanged. Temporary cleanup failure is reported separately and never turns
an invalid build into success.

## CLI

The `plotpoint` binary mirrors programmatic operations:

```text
plotpoint validate --project <dir> [--config <file>] [--json]
plotpoint compile --project <dir> --out <new.pprelease> [--config <file>] [--json]
plotpoint inspect <release.pprelease> [--json]
plotpoint verify <release.pprelease> [--expect sha256:<hex>] [--json]
```

Exit code `0` means the requested operation succeeded. Invalid projects, incompatible releases, or
failed verification return a stable non-zero author-error code. Infrastructure failure returns a
distinct non-zero code. JSON output contains the discriminated result and no ANSI text.

`inspect` and `verify` delegate to `@plotpoint/protocol`; they do not load game code. Without
`--expect`, verification proves structural and internal integrity only and labels the result
accordingly. With `--expect`, it additionally proves equality to the trusted expected release.

## Public Export Discipline

The compiler root exports input/result/diagnostic types plus `validateProject` and `compileProject`.
Release construction, opening, manifest, identity, inspection, verification, and compatibility types
come from `@plotpoint/protocol` rather than being duplicated. Internal parser, bundler, Ajv,
subprocess, ZIP, canonicalization, digest, and filesystem types are not public compatibility surfaces.
