# Quickstart: Loop 1 Field Puzzle

## Author And Install

```sh
pnpm --filter @plotpoint/compiler build
pnpm plotpoint validate --project examples/releases/field-puzzle
pnpm plotpoint compile --project examples/releases/field-puzzle --out /tmp/field-puzzle.pprelease
pnpm plotpoint serve /tmp/field-puzzle.pprelease
```

Open the internal Plotpoint development client, scan the displayed QR, confirm the expected release
identity, and wait for installation to publish. Disconnect the device before play.

The development client is intentionally configured for private-LAN HTTP during installation. Runtime
WebView navigation and network access remain disabled; the trusted game reaches native functionality
only through Host Bridge 1.0. This is a core-team trust boundary, not hostile-code isolation.

## Play And Recover

Visit checkpoint one, solve the puzzle, and visit checkpoint two. Terminate and relaunch the player
after each accepted step. The restored view must show the same release, aggregate version, and
progression without repeating a command.

## Learn And Revise

Export the play report through the native share sheet. Confirm that it has outcome, version, quality,
recovery, and diagnostic evidence but no raw coordinates, payloads, or state. Change one clue,
coordinate, or radius; compile a new output path; serve and scan it; confirm a distinct release and
fresh run.

## Provider-Free Verification

```sh
pnpm verify
```

Physical iOS and Android field evidence is recorded separately because automated verification uses
scripted location and lifecycle adapters.
