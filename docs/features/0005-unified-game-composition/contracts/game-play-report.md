# Contract: Game Play Report

## Committed Evidence Amendment

The report is projected only from append-only host-owned gameplay events committed by the responsible
boundary. Each event has run, durable sequence, committed timestamp, kind, optional internal command ID,
and validated generic evidence. Local commit records the actual observation-consumption trace; shared
pull records exact participant results and mechanic capability evidence; synchronization records its
real phase/disposition and time; lifecycle/recovery record completed transitions.

Export uses one read transaction, durable event order, deterministic command aliases, existing privacy
allowlists, and the unchanged public `GamePlayReport` validator. It never reads mechanic configuration,
guesses freshness, assumes submitted/resulting version relationships, or reconstructs semantics by
joining command, observation, synchronization, and lifecycle tables.

Game Play Report is the only report produced by the corrected pre-release player. It replaces the
local and game-specific report builders in place; there are no historical readers, compatibility
aliases, or report migrations. Report selection uses only the installed run and its optional immutable
shared-session binding and never checks a game, mechanic, command, component, or schema-specific ID.
`packages/protocol/src/player/report.ts` is the sole protocol owner; the prior
`packages/protocol/src/shared/report.ts` contract and its public exports are deleted rather than retained
as a shared-only alternative.

```ts
interface GamePlayReport {
  readonly releaseId: `sha256:${string}`;
  readonly platform: "ios" | "android";
  readonly durationMs: number;
  readonly shared?: {
    readonly membership: "active" | "revoked";
  };
  readonly events: readonly GamePlayReportEvent[];
}

type GamePlayReportEvent =
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
      readonly expectedStateVersion: number;
      readonly resultingStateVersion?: number;
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
      readonly code: ReportSafeDiagnosticCode;
      readonly commandAlias?: string;
    };

declare const reportSafeDiagnosticCode: unique symbol;
type ReportSafeDiagnosticCode = string & {
  readonly [reportSafeDiagnosticCode]: true;
};
```

The host builds the report from committed lifecycle, receipt, observation-use, shared-result, and sync
records. `durationMs` derives from committed timestamps rather than export wall-clock time. Ordering is
`(elapsedMs, kind, stable source sequence)` with ordinal comparison. Repeated export from unchanged
durable state is byte-equivalent after canonical JSON encoding.

Only `commandAlias` carries information: it correlates events for the same redacted command. Constant
run, session, participant, and team aliases are omitted because they do not distinguish anything inside
a report. The optional shared section says only whether shared evidence exists and whether membership
was ultimately active or revoked.

Command outcomes, game-specific completion fields, and raw diagnostic text are excluded. A diagnostic
code enters `ReportSafeDiagnosticCode` only through a host-owned closed allowlist. The report also
contains no raw aggregate or projection value, content/configuration value, credential, invitation,
service origin, participant/team/session ID, precise location, observation payload, host path, or bundle
source. Product acceptance tests establish semantic completion separately from this evidence export.

The co-op revision acceptance may use a generic `command` event with terminal `rejected` together with
a `capability` event whose disposition is `expired` to justify changing observation-freshness
configuration. That learning path does not add the target, payload, outcome code, configuration value,
or any other game-specific report field.
