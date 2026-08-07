# Contract: Foreground Location Capability

Capability identity: `plotpoint.location.foreground`, major 1, minor 0.

Capability input is exactly `{}`. Capability output is `LocationObservation`.

```ts
interface LocationObservationBase {
  readonly version: typeof CONTRACT_VERSIONS.capabilityObservation;
  readonly observationId: string;
  readonly recordedAt: string;
}

type LocationObservation =
  | (LocationObservationBase & {
      readonly availability: "available";
      readonly capturedAt: string;
      readonly ageMs: number;
      readonly latitude: number;
      readonly longitude: number;
      readonly horizontalAccuracy: number;
    })
  | (LocationObservationBase & {
      readonly availability: "permission-denied" | "unavailable";
    })
  | (LocationObservationBase & {
      readonly availability: "failed";
      readonly diagnosticCode: string;
    });
```

Every variant is a closed object with a non-empty stable identity and RFC 3339 timestamps. Available
coordinates are finite and within geographic range; horizontal accuracy is finite and non-negative;
age is a finite safe integer and may be negative when the sensor timestamp is in the future.

The host persists every terminal observation before returning it. Unavailable variants never contain
coordinates, sensor capture time, or accuracy. A command explicitly identifies each observation it
consumes, and the host confirms same-run ownership before accepting a transition.

The host does not decide checkpoint membership. Release logic applies coordinates, radius, maximum
accuracy, freshness, clues, and progression rules to the explicit observation value. Background
location and continuous tracking are outside.

## Report Projection

Location contributes this closed redacted projection to a Play Report capability event:

```ts
interface LocationReportProjection {
  readonly availability: "available" | "permission-denied" | "unavailable" | "failed";
  readonly recencyBand: "fresh" | "stale" | "future" | "unknown";
  readonly accuracyBand: "excellent" | "good" | "degraded" | "unknown";
}
```

The projection contains no coordinates, sensor timestamps, raw accuracy, or diagnostic detail beyond
stable non-sensitive outcome codes.
