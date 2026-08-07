import { FOREGROUND_LOCATION_CAPABILITY } from "@plotpoint/protocol";

import { appendGameplayEvidence, type GameplayEvidenceDatabase } from "./gameplay-evidence";

export type ObservationRecordInput = {
  runId: string;
  observationId: string;
  recordedAt: string;
  capturedAt?: string;
  ageMs?: number;
  availability: string;
  latitude?: number;
  longitude?: number;
  horizontalAccuracy?: number;
  diagnosticCode?: string;
  elapsedMs: number;
};

export interface ObservationPersistenceDatabase extends GameplayEvidenceDatabase {
  withExclusiveTransactionAsync(
    operation: (database: GameplayEvidenceDatabase) => Promise<void>,
  ): Promise<void>;
}

export async function recordLocationObservation(
  database: ObservationPersistenceDatabase,
  input: ObservationRecordInput,
): Promise<void> {
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `INSERT INTO observations
       (run_id, observation_id, recorded_at, captured_at, age_ms, availability, latitude, longitude,
        sensor_captured_at, horizontal_accuracy, diagnostic_code, elapsed_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.runId,
      input.observationId,
      input.recordedAt,
      input.capturedAt ?? input.recordedAt,
      input.ageMs ?? null,
      input.availability,
      input.latitude ?? null,
      input.longitude ?? null,
      input.capturedAt ?? null,
      input.horizontalAccuracy ?? null,
      input.diagnosticCode ?? null,
      input.elapsedMs,
    );
    await appendGameplayEvidence(transaction, {
      runId: input.runId,
      timing: { committedAt: input.recordedAt, elapsedMs: input.elapsedMs },
      evidence: {
        kind: "capability",
        capabilityId: FOREGROUND_LOCATION_CAPABILITY.id,
        disposition: input.availability === "available" ? "captured" : "denied",
      },
    });
  });
}
