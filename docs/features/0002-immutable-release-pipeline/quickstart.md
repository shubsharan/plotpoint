# Quickstart: Build and Verify an Immutable Release

This walkthrough is an acceptance flow for the planned Gate 2 contracts. It uses only public package
and CLI surfaces from an external-consumer-style project.

## 1. Prepare a Project

Start from a directory outside the Plotpoint workspace:

```text
minimal-puzzle/
├── plotpoint.project.json
├── src/
│   ├── logic.ts
│   ├── presentation.ts
│   ├── commands/solve.ts
│   ├── progression/main.ts
│   └── components/puzzle.ts
├── schemas/
│   ├── player-state.schema.json
│   ├── solve-payload.schema.json
│   └── solve-outcome.schema.json
├── content/puzzle.json
└── assets/clue.png
```

Pin the Plotpoint compiler, package manager, dependencies, lockfile, and the compiler-owned Rolldown
1.2.2 dependency. Authors do not provide a Rolldown config or plugin. The data-only project file
selects named exports and explicitly registers schemas, progression, components, content, and assets.
It does not contain project identity, release labels, channels, or timestamps.

## 2. Validate Without Emitting

```bash
pnpm exec plotpoint validate --project /absolute/path/to/minimal-puzzle
```

Expected result:

- configuration and referenced files are captured once;
- logic and presentation graphs pass their distinct import policies;
- command and progression exports agree with registrations;
- schemas, content, components, assets, capabilities, and references resolve;
- no `.pprelease` output exists.

Seed one defect at a time to confirm the first diagnostic points to the relevant config pointer,
source location, logical reference, or asset path and has the expected stable category.

## 3. Compile to a New Output

```bash
pnpm exec plotpoint compile \
  --project /absolute/path/to/minimal-puzzle \
  --out /absolute/path/to/output/minimal-puzzle.pprelease
```

The output path must not name an unrelated existing file. A successful result prints the finalized
path, `sha256:<hex>` release identity, and manifest summary only after the temporary artifact has
passed the consumer verifier and been atomically published.

An invalid or interrupted build must leave no completed file at the requested path. Temporary
remnants are not release files and cannot produce a success receipt.

## 4. Inspect Without Executing Game Code

```bash
pnpm exec plotpoint inspect /absolute/path/to/output/minimal-puzzle.pprelease --json
```

Confirm the response includes:

- release-format version;
- host API major and minimum minor;
- exact player, team, or session schema requirements;
- derived native capability requirements;
- logic and presentation entry roles;
- exact inventory paths, kinds, lengths, and entry digests;
- computed whole-artifact release identity.

Inspection must not import, evaluate, or extract the logic or presentation bundle.

## 5. Verify a Known Identity

```bash
pnpm exec plotpoint verify \
  /absolute/path/to/output/minimal-puzzle.pprelease \
  --expect sha256:<identity-from-compile>
```

This proves strict container structure, canonical manifest, exact inventory, entry bytes, and equality
to the trusted expected release. Running verification without `--expect` proves internal consistency
but must not claim publisher authenticity or equality to a previously known release.

## 6. Prove Source Independence

Copy the release to a clean directory, remove access to the project source, author dependencies, and
workspace aliases, then repeat inspection and verification. A downstream reader must be able to load
every inventoried entry from the artifact alone. No package discovery or dependency resolution may
occur.

## 7. Prove Byte Reproducibility

Compile each valid golden project 20 times from the same frozen inputs and pinned toolchain into 20
distinct new output paths. Vary cwd, output basename, temp basename, wall clock, and registry-only
label/channel/project/timestamp values outside the project file.

For every run, compare the complete file bytes and computed release identity. All 20 artifacts for a
fixture must be byte-identical. A source mutation during a build must fail rather than produce mixed
bytes.

## 8. Prove Tamper Detection

Work only on disposable copies. Test one mutation at a time:

- alter one byte in the manifest and each entry kind;
- remove, add, duplicate, reorder, truncate, or rename an entry;
- introduce a forbidden path or unsupported ZIP field;
- rewrite one payload and its manifest digest together.

Structural or entry mutations must fail internal verification with the affected path or relationship.
A coordinated payload-plus-manifest rewrite may be internally consistent but must fail against the
original expected release identity.

## 9. Acceptance Matrix

Run the flow for at least:

1. A minimal local puzzle using one player schema.
2. A branching media tour with multiple content, component, and asset entries.
3. A team/session hunt with multiple aggregate schemas and capability requirements.

Also run one isolated invalid project per compiler diagnostic category, path-boundary and symlink
cases, subprocess timeout/invalid-output cases, and interruption injection before every publication
boundary.

## Expected Evidence

- Three complete source-independent artifacts.
- Sixty repeated builds with identical bytes within each fixture.
- One precise failure fixture for every required compiler category.
- Tamper rejection across manifest, container, bundle, content, schema, component, and asset bytes.
- No completed artifact after any failed or interrupted compilation.
