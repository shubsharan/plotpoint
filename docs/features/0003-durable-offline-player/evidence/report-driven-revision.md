# Provider-Free Report-Driven Revision Evidence

**Recorded**: 2026-08-03
**Scope**: Scripted provider-free evidence only
**Physical iOS and Android status**: NOT RUN

This record proves that the report can expose a field-play signal, drive a concrete release change,
and carry materially different releases through the same player contracts. It does not claim that a
physical device produced the signal or that the revised threshold is empirically calibrated.

## Report Signal And Revision

The `PlayReportV1` field fixture records an available foreground-location observation in the
`degraded` accuracy band, linked to a rejected `field-check-in` command whose redacted outcome code is
`inaccurate`. The exported event timeline contains neither coordinates nor raw horizontal accuracy.

That scripted signal drove one provisional field-rule revision:

- Original maximum horizontal accuracy: 30 metres at both checkpoints.
- Revised maximum horizontal accuracy: 40 metres at both checkpoints.
- Changed release inputs: `examples/releases/field-puzzle/src/config.ts` and the matching authored
  content in `examples/releases/field-puzzle/content/game.json`.
- Unchanged rules: checkpoint coordinates, 45 metre radii, 15 second freshness, clues, answer, and
  progression.

The committed baseline and revised worktree were compiled independently with the same compiler:

| Release                     | Identity                                                                  |
| --------------------------- | ------------------------------------------------------------------------- |
| Committed 30 metre baseline | `sha256:9475e444f11f137db40bc64ec4cceb8d0afa42f0d6b1dcc06c57e18834272793` |
| Revised 40 metre release    | `sha256:d5de77c87cca5371cb3e157b5606ba3320bf0c29ba193a6a69614638a6566137` |

Distinct identities establish changed bytes. The run-lifecycle fixture proves that identical bytes
resume their active run, while the revised identity creates a fresh run and retains the prior run.

## Two-Release Player Conformance

One branch-free harness exercised these materially different fixtures:

| Fixture              | Identity                                                                  | Release-specific difference                              |
| -------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| Field puzzle         | `sha256:521f60ab0dfeea2b53d0b347dae978f904376e5de5af7a1340bb5ef073fa2110` | Field aggregate plus Location V1 requirement             |
| Minimal local puzzle | `sha256:f0bec61511b940909617bd28a2dbdc94af3e8100f831bd905243ee6a9518d078` | Different aggregate schema and no capability requirement |

For each fixture, the provider-free harness verified exact descriptor identity and artifact bytes,
published through the generic install contract, produced Host API bootstrap and accepted transition
responses, validated the snapshot/journal/receipt recovery graph, and emitted a valid redacted report
command event. No player branch or game-specific lifecycle rule selected either release.

## Verification Record

- `pnpm --filter @plotpoint/protocol build` — PASS.
- `pnpm --filter @plotpoint/player check-types` — PASS.
- `pnpm --filter @plotpoint/player test` — PASS, 9 files and 43 tests.
- `pnpm exec vitest run --config vitest.config.ts --project field-puzzle` — PASS, 1 file and 4 tests.
- `pnpm --filter @plotpoint/compiler build` — PASS.
- Baseline and revised `pnpm plotpoint compile` commands — PASS with the identities recorded above.

## Remaining External Evidence

The degraded-accuracy observation is scripted and cannot establish native permission behavior, sensor
quality, private-LAN reachability, or route usability. Both early and final iOS/Android loops remain
`NOT RUN` in [physical-devices.md](physical-devices.md); those observations may confirm, revise, or
reverse the provisional 40 metre rule.
