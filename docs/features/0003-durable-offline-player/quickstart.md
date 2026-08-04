# Quickstart: Loop 1 Field Puzzle

## Author And Install

```sh
pnpm --filter @plotpoint/compiler build
pnpm plotpoint validate --project examples/releases/field-puzzle
pnpm plotpoint compile --project examples/releases/field-puzzle --out /tmp/field-puzzle.pprelease
pnpm plotpoint serve /tmp/field-puzzle.pprelease
```

Open the generated Plotpoint debug app, scan the displayed QR, wait for installation to publish, and
confirm that the displayed release identity matches the server. Disconnect the device before play.

The debug app is intentionally configured for private-LAN HTTP during installation. Runtime
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

The provider-free gate includes one Host API conformance harness for the field puzzle and minimal local
puzzle. Passing proves both releases use the same bootstrap and transition contract without player
branches; it does not prove native platform behavior.

Run the native platform checks against available simulated devices:

```sh
pnpm --filter @plotpoint/player exec expo run:ios --device "iPhone 17 Pro" --no-bundler
ANDROID_HOME="$HOME/Library/Android/sdk" pnpm --filter @plotpoint/player exec expo run:android --no-bundler
```

For feature acceptance, these commands prove the dependency-aligned native projects build, install,
and launch; `pnpm verify` supplies complete scripted route, lifecycle, recovery, and revision evidence.
They do not prove camera scanning, GPS behavior, private-LAN reachability, or real process/device
recovery. Those observations remain explicitly `NOT RUN` in `evidence/physical-devices.md` until a
later Loop 1 field-validation pass.
