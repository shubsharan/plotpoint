# Contract: Shared Hunt Report V1

The session-oriented report reuses the canonical Play Report terminal taxonomy and Location V1 redacted
projection. Reusable identities become deterministic export-local aliases.

```ts
interface SharedHuntReportV1 {
  readonly version: 1;
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
  readonly events: readonly SharedHuntReportEventV1[];
}

type SharedHuntReportEventV1 =
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
      readonly projection: LocationReportProjectionV1;
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
