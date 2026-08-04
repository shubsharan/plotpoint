# Contract: Play Report V1

```ts
interface PlayReportV1 {
  readonly version: 1;
  readonly releaseId: `sha256:${string}`;
  readonly runId: string;
  readonly platform: "ios" | "android";
  readonly durationMs: number;
  readonly events: readonly PlayReportEventV1[];
}

type PlayReportEventV1 =
  | {
      readonly kind: "command";
      readonly elapsedMs: number;
      readonly commandId: string;
      readonly terminal: "accepted" | "no-op" | "rejected" | "invalid";
      readonly expectedVersion: number;
      readonly resultingVersion: number;
      readonly outcomeCode?: string;
      readonly progressionChanges: readonly string[];
    }
  | {
      readonly kind: "capability";
      readonly elapsedMs: number;
      readonly capability: {
        readonly id: string;
        readonly major: number;
      };
      readonly recordId: string;
      readonly outcomeCode: string;
      readonly projection: object;
    }
  | {
      readonly kind: "lifecycle";
      readonly elapsedMs: number;
      readonly phase: string;
      readonly disposition: string;
      readonly commandId?: string;
      readonly diagnosticCode?: string;
    }
  | {
      readonly kind: "diagnostic";
      readonly elapsedMs: number;
      readonly code: string;
      readonly commandId?: string;
    };
```

`durationMs` and every `elapsedMs` are non-negative safe integers relative to the run's host-recorded
start. Events are ordered by non-decreasing `elapsedMs`, with a stable host-defined tie break. Command
events keep terminal, versions, redacted outcome code, and progression changes together so a report can
explain both successful and failed play.

Every capability event projection must validate against the independently versioned allowlist defined
by that capability contract. Location V1 uses `LocationReportProjectionV1`; Host API Core does not
define location-specific report fields.

The report is an allowlisted projection and never contains absolute timestamps, coordinates,
credentials, command payloads, raw aggregate state, arbitrary outcome objects, protected content, host
paths, or stack traces. Outcome codes and diagnostic codes must be stable, non-sensitive identifiers.

Report creation validates the run, release, receipts, journal positions, observation links, and event
ordering. Missing or incoherent durable records fail explicitly; V1 never emits a success-shaped
partial report.
