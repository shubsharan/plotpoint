# Contract: Game Play Report V2

Game Play Report V2 replaces the new-release use of local Play Report V1 and hunt-specific Shared Hunt
Report V1 with one host-owned evidence format. Historical V1 reports remain readable; Project
Configuration V2 releases export only V2. Report selection never checks a game, mechanic, command,
component, or schema-specific ID.

```ts
interface GamePlayReportV2 {
  readonly version: 2;
  readonly releaseId: `sha256:${string}`;
  readonly runAlias: "run";
  readonly platform: "ios" | "android";
  readonly durationMs: number;
  readonly shared?: {
    readonly sessionAlias: "session";
    readonly participantAlias: "self";
    readonly teamAlias: "team";
    readonly membership: "active" | "revoked";
  };
  readonly events: readonly GamePlayReportEventV2[];
}

type GamePlayReportEventV2 =
  | {
      readonly kind: "lifecycle";
      readonly elapsedMs: number;
      readonly disposition: "mounted" | "recovered" | "unmounted" | "mount-failed";
    }
  | {
      readonly kind: "command";
      readonly elapsedMs: number;
      readonly scope: "local" | "shared";
      readonly commandAlias: string;
      readonly terminal:
        "pending" | "accepted" | "no-op" | "rejected" | "invalid" | "blocked-revoked";
      readonly expectedRevision: number;
      readonly resultingRevision?: number;
    }
  | {
      readonly kind: "capability";
      readonly elapsedMs: number;
      readonly capabilityId: string;
      readonly disposition: "captured" | "consumed" | "denied" | "expired";
    }
  | {
      readonly kind: "synchronization";
      readonly elapsedMs: number;
      readonly phase:
        "offline" | "connecting" | "submitting" | "pulling" | "current" | "degraded" | "revoked";
      readonly disposition:
        | "scheduled"
        | "coalesced"
        | "batch-claimed"
        | "submit-succeeded"
        | "submit-failed"
        | "pull-applied"
        | "pull-failed"
        | "membership-revoked";
    }
  | {
      readonly kind: "recovery";
      readonly elapsedMs: number;
      readonly disposition: "run-restored" | "join-resumed" | "snapshot-replaced" | "cursor-reset";
    }
  | {
      readonly kind: "diagnostic";
      readonly elapsedMs: number;
      readonly code: ReportSafeDiagnosticCodeV2;
      readonly commandAlias?: string;
    };

declare const reportSafeDiagnosticCode: unique symbol;
type ReportSafeDiagnosticCodeV2 = string & {
  readonly [reportSafeDiagnosticCode]: true;
};
```

The host builds the report from committed lifecycle, receipt, observation-use, shared-result, and sync
records. One generic `createGamePlayReportV2(runId)` path includes the `shared` section only when that
run has an immutable binding. `durationMs` is derived from committed run/event timestamps rather than
the export wall clock. It never invokes release code or derives game-specific completion fields.
Product tests establish semantic completion separately from this evidence export.

Ordering is `(elapsedMs, kind, stable source sequence)` with ordinal comparison. IDs become deterministic
report-local aliases. Command outcomes are excluded. A diagnostic code enters the branded report-safe
type only through a host-owned closed allowlist; raw parser, handler, transport, or platform error text
cannot be branded. Diagnostic details are excluded.

The report contains no raw aggregate or projection value, content/configuration value, credential,
invitation, service origin, participant/team/session ID, precise location, observation payload, host
path, or bundle source. Repeated export from unchanged durable state is byte-equivalent after canonical
JSON encoding.
