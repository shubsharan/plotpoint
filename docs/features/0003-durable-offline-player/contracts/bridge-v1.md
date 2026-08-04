# Contract: Host Bridge V1

Every message is a closed canonical JSON object:

```ts
interface HostBridgeEnvelopeV1<Type extends string, Payload> {
  readonly version: 1;
  readonly requestId: string;
  readonly type: Type;
  readonly payload: Payload;
}
```

`requestId` correlates one transport exchange. It is not the durable idempotency identity; repeated
delivery with a new request ID and the same command ID must return the original Command Receipt.

## Release-Facing Client

Release presentation code imports the narrow `@plotpoint/protocol/player` surface and creates one
`HostRuntimeClientV1` from the bootstrap document's raw transport. The transport owns envelope
serialization; game code uses semantic methods and does not reconstruct wire payloads:

```ts
interface HostRuntimeClientV1 {
  commitTransition(candidate: TransitionCandidateV1): Promise<TransitionResultV1>;
  requestCapability<Input extends object, Output extends object>(
    capability: CapabilityVersionV1,
    input: Input,
    validateOutput: (value: unknown) => value is Output,
  ): Promise<Output>;
}
```

The client validates the closed transition-result shape, command and terminal correlation,
capability-result shape and identity, and capability-owned output before returning. Raw `send(type,
payload)` remains an internal WebView transport seam rather than the game-facing API. Runtime
preflight failures are local non-committable results; only recorded execution terminals become
`transition.commit` candidates.

## WebView To Host

### `runtime.ready`

Payload is exactly `{}`. The corresponding `runtime.bootstrap` result contains:

```ts
interface RuntimeBootstrapV1 {
  readonly runId: string;
  readonly releaseId: `sha256:${string}`;
  readonly aggregate: null | {
    readonly aggregateId: string;
    readonly aggregateKind: "player";
    readonly schemaId: string;
    readonly schemaVersion: number;
    readonly stateVersion: number;
    readonly state: object;
  };
}
```

### `transition.commit`

Payload is exactly `{ candidate: TransitionCandidateV1 }`.

```ts
interface TransitionCandidateBaseV1 {
  readonly commandId: string;
  readonly target: {
    readonly aggregateId: string;
    readonly aggregateKind: "player";
    readonly schemaId: string;
    readonly schemaVersion: number;
  };
  readonly expectedVersion: number;
  readonly observationIds: readonly string[];
}

type TransitionCandidateV1 =
  | (TransitionCandidateBaseV1 & {
      readonly terminal: "accepted";
      readonly nextState: object;
      readonly outcome: object;
      readonly progressionChanges: readonly string[];
    })
  | (TransitionCandidateBaseV1 & {
      readonly terminal: "no-op" | "rejected";
      readonly outcome: object;
    })
  | (TransitionCandidateBaseV1 & {
      readonly terminal: "invalid";
      readonly diagnosticCodes: readonly string[];
    });
```

The host validates command identity, target, expected version, exact terminal shape, canonical values,
schema compatibility, unique observation identities, and same-run observation ownership. An accepted
changing candidate atomically commits its receipt, next snapshot, journal entry, and observation links.
Other canonical terminals commit only their receipt and observation links. The result is:

```ts
interface TransitionResultV1 {
  readonly commandId: string;
  readonly disposition: "committed" | "duplicate";
  readonly terminal: "accepted" | "no-op" | "rejected" | "invalid";
  readonly resultingVersion: number;
  readonly outcome?: object;
  readonly diagnosticCodes?: readonly string[];
}
```

### `capability.request`

Host API V1 supplies one generic dispatch envelope while each capability owns its closed input and
output contract:

```ts
interface CapabilityRequestV1 {
  readonly capability: {
    readonly id: string;
    readonly major: number;
    readonly minor: number;
  };
  readonly input: object;
}

interface CapabilityResultV1 {
  readonly capability: {
    readonly id: string;
    readonly major: number;
    readonly minor: number;
  };
  readonly output: object;
}
```

The host accepts only a capability declared by the verified release, implemented by the player, and
compatible at the requested version. The registry dispatches to that capability's exact validator and
native adapter; unknown input or output fields are rejected. Loop 1 registers only
`plotpoint.location.foreground` V1, whose input is exactly `{}` and whose output is
`LocationObservationV1` from `location-v1.md`.

## Host To WebView

- `runtime.bootstrap`: `RuntimeBootstrapV1`.
- `transition.result`: `TransitionResultV1`.
- `capability.result`: `CapabilityResultV1` with capability-validated output.
- `host.error`: exactly `{ code: string, commandId?: string, currentVersion?: number }`.

`host.error` represents malformed envelopes, unsupported direction/type/version, stale aggregate
version, incompatible schema, missing observation, or other host-policy rejection. It never changes
durable gameplay state and never becomes a Command Receipt.

Unknown versions, message types, envelope fields, payload fields, invalid direction, or noncanonical
values produce `host.error`. Native operations are available only through these request types.
