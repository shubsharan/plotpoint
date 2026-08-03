import type { JsonValue } from "./canonical-json.js";
import { createDiagnostic, type Diagnostic } from "./diagnostics.js";

export interface Observation<Value extends JsonValue = JsonValue> {
  readonly kind: string;
  readonly key: string;
  readonly value: Value;
}

export interface ObservationConsumption<Value extends JsonValue = JsonValue> {
  readonly index: number;
  readonly kind: string;
  readonly key: string;
  readonly value: Value;
}

export interface TransitionContext {
  take<Value extends JsonValue>(kind: string, key: string): Value;
}

export class ObservationFault extends Error {
  readonly diagnostic: Diagnostic;

  constructor(diagnostic: Diagnostic) {
    super(diagnostic.code);
    this.name = "ObservationFault";
    this.diagnostic = diagnostic;
  }
}

export interface ObservationCursor {
  readonly context: TransitionContext;
  readonly trace: readonly ObservationConsumption[];
  readonly consumed: number;
}

export function createObservationCursor(observations: readonly Observation[]): ObservationCursor {
  const trace: ObservationConsumption[] = [];
  let index = 0;
  const context: TransitionContext = Object.freeze({
    take<Value extends JsonValue>(kind: string, key: string): Value {
      const provided = observations[index];
      if (provided === undefined) {
        throw new ObservationFault(
          createDiagnostic("observation-exhausted", {
            index,
            requestedKey: key,
            requestedKind: kind,
          }),
        );
      }
      if (provided.kind !== kind || provided.key !== key) {
        throw new ObservationFault(
          createDiagnostic("observation-order-mismatch", {
            index,
            providedKey: provided.key,
            providedKind: provided.kind,
            requestedKey: key,
            requestedKind: kind,
          }),
        );
      }
      const entry = Object.freeze({ index, kind, key, value: provided.value });
      trace.push(entry);
      index += 1;
      return provided.value as Value;
    },
  });

  return {
    context,
    get trace() {
      return Object.freeze([...trace]);
    },
    get consumed() {
      return index;
    },
  };
}
