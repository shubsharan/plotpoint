# Contract: Shared Hunt Report

The session-oriented report reuses the canonical Play Report terminal taxonomy and Location redacted
projection. Reusable identities become deterministic export-local aliases.

```ts
interface SharedHuntReport {
  readonly version: typeof CONTRACT_VERSIONS.sharedReport;
  readonly releaseId: `sha256:${string}`;
  readonly sessionAlias: string;
  readonly selfAlias: "self";
  readonly platform: "ios" | "android";
  readonly durationMs: number;
  readonly completion: {
    readonly completedTargets: number;
    readonly totalTargets: number;
    readonly complete: boolean;
  };
  readonly events: readonly SharedHuntReportEvent[];
}

type SharedHuntReportEvent =
  | {
      readonly kind: "command";
      readonly elapsedMs: number;
      readonly commandAlias: string;
      readonly terminal:
        "pending" | "accepted" | "no-op" | "rejected" | "invalid" | "blocked-revoked";
      readonly expectedVersion: number;
      readonly resultingVersion?: number;
      readonly outcomeCode?: string;
    }
  | {
      readonly kind: "location";
      readonly elapsedMs: number;
      readonly commandAlias: string;
      readonly projection: LocationReportProjection;
    }
  | {
      readonly kind: "synchronization";
      readonly elapsedMs: number;
      readonly phase:
        "offline" | "connecting" | "pulling" | "submitting" | "current" | "degraded" | "revoked";
      readonly disposition: string;
    }
  | {
      readonly kind: "recovery";
      readonly elapsedMs: number;
      readonly disposition: "resumed" | "snapshot-replaced" | "cursor-reset";
      readonly stateVersion?: number;
    }
  | {
      readonly kind: "diagnostic";
      readonly elapsedMs: number;
      readonly code: string;
      readonly commandAlias?: string;
    };
```

The report contains no coordinates, sensor timestamps, raw accuracy, absolute wall-clock timestamps,
credentials, invitations, request payloads, aggregate/projection state, protected content, reusable
session/participant/command identities, SQL errors, paths, or stacks. Generation is all-or-nothing.
