import * as Location from "expo-location";

import type { LocationObservationV1 } from "@plotpoint/protocol";

import type { PlayerDatabase } from "../persistence/database";

function identifier(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${random}`;
}

export async function captureForegroundLocation(input: {
  readonly database: PlayerDatabase;
  readonly runId: string;
  readonly startedAt: string;
}): Promise<LocationObservationV1> {
  const observationId = identifier("location");
  const capturedAt = new Date().toISOString();
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    const observation: LocationObservationV1 = {
      version: 1,
      observationId,
      capturedAt,
      availability: "permission-denied",
    };
    await input.database.recordObservation({
      runId: input.runId,
      observationId,
      capturedAt,
      availability: observation.availability,
      elapsedMs: Date.now() - Date.parse(input.startedAt),
    });
    return observation;
  }
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      mayShowUserSettingsDialog: true,
    });
    const observation: LocationObservationV1 = {
      version: 1,
      observationId,
      capturedAt: new Date(location.timestamp).toISOString(),
      availability: "available",
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      horizontalAccuracy: location.coords.accuracy ?? undefined,
    };
    await input.database.recordObservation({
      runId: input.runId,
      observationId,
      capturedAt: observation.capturedAt,
      availability: observation.availability,
      latitude: observation.latitude,
      longitude: observation.longitude,
      horizontalAccuracy: observation.horizontalAccuracy,
      elapsedMs: Date.now() - Date.parse(input.startedAt),
    });
    return observation;
  } catch {
    const observation: LocationObservationV1 = {
      version: 1,
      observationId,
      capturedAt,
      availability: "unavailable",
    };
    await input.database.recordObservation({
      runId: input.runId,
      observationId,
      capturedAt,
      availability: observation.availability,
      elapsedMs: Date.now() - Date.parse(input.startedAt),
    });
    return observation;
  }
}
