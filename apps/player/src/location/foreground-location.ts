import * as Location from "expo-location";

import {
  FOREGROUND_LOCATION_CAPABILITY,
  isLocationObservation,
  isLocationRequestInput,
  type CanonicalJsonObject,
  type LocationObservation,
} from "@plotpoint/protocol";

import type { CapabilityRegistration } from "../bridge/host-bridge";
import type { PlayerDatabase } from "../persistence/database";

export interface ForegroundLocationNativeAdapter {
  requestPermission(): Promise<"granted" | "denied">;
  capture(): Promise<null | {
    readonly timestamp: number;
    readonly latitude: number;
    readonly longitude: number;
    readonly horizontalAccuracy: number | null;
  }>;
}

export interface ForegroundLocationPersistence {
  recordObservation(input: Parameters<PlayerDatabase["recordObservation"]>[0]): Promise<void>;
}

const expoLocationAdapter: ForegroundLocationNativeAdapter = {
  async requestPermission() {
    const permission = await Location.requestForegroundPermissionsAsync();
    return permission.granted ? "granted" : "denied";
  },
  async capture() {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      mayShowUserSettingsDialog: true,
    });
    return {
      timestamp: location.timestamp,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      horizontalAccuracy: location.coords.accuracy,
    };
  },
};

function identifier(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `location-${random}`;
}

function availableValuesAreValid(location: {
  readonly timestamp: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly horizontalAccuracy: number | null;
}): location is typeof location & { readonly horizontalAccuracy: number } {
  return (
    Number.isFinite(location.timestamp) &&
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180 &&
    location.horizontalAccuracy !== null &&
    Number.isFinite(location.horizontalAccuracy) &&
    location.horizontalAccuracy >= 0
  );
}

async function persistBeforeDelivery(
  persistence: ForegroundLocationPersistence,
  runId: string,
  startedAt: string,
  observation: LocationObservation,
): Promise<LocationObservation> {
  await persistence.recordObservation({
    runId,
    observationId: observation.observationId,
    recordedAt: observation.recordedAt,
    capturedAt: observation.availability === "available" ? observation.capturedAt : undefined,
    ageMs: observation.availability === "available" ? observation.ageMs : undefined,
    availability: observation.availability,
    latitude: observation.availability === "available" ? observation.latitude : undefined,
    longitude: observation.availability === "available" ? observation.longitude : undefined,
    horizontalAccuracy:
      observation.availability === "available" ? observation.horizontalAccuracy : undefined,
    diagnosticCode: observation.availability === "failed" ? observation.diagnosticCode : undefined,
    elapsedMs: Math.max(0, Date.parse(observation.recordedAt) - Date.parse(startedAt)),
  });
  return observation;
}

export interface CaptureForegroundLocationInput {
  readonly database: ForegroundLocationPersistence;
  readonly runId: string;
  readonly startedAt: string;
  readonly adapter?: ForegroundLocationNativeAdapter;
  readonly now?: () => Date;
  readonly createObservationId?: () => string;
}

export async function captureForegroundLocation(
  input: CaptureForegroundLocationInput,
): Promise<LocationObservation> {
  const adapter = input.adapter ?? expoLocationAdapter;
  const observationId = (input.createObservationId ?? identifier)();
  const recordedAt = () => (input.now ?? (() => new Date()))().toISOString();
  let observation: LocationObservation;

  try {
    if ((await adapter.requestPermission()) === "denied") {
      observation = {
        observationId,
        recordedAt: recordedAt(),
        availability: "permission-denied",
      };
    } else {
      const location = await adapter.capture();
      const hostRecordedAt = recordedAt();
      if (location === null) {
        observation = {
          observationId,
          recordedAt: hostRecordedAt,
          availability: "unavailable",
        };
      } else if (!availableValuesAreValid(location)) {
        observation = {
          observationId,
          recordedAt: hostRecordedAt,
          availability: "failed",
          diagnosticCode: "location-result-invalid",
        };
      } else {
        observation = {
          observationId,
          recordedAt: hostRecordedAt,
          availability: "available",
          capturedAt: new Date(location.timestamp).toISOString(),
          ageMs: Date.parse(hostRecordedAt) - location.timestamp,
          latitude: location.latitude,
          longitude: location.longitude,
          horizontalAccuracy: location.horizontalAccuracy,
        };
      }
    }
  } catch {
    observation = {
      observationId,
      recordedAt: recordedAt(),
      availability: "failed",
      diagnosticCode: "location-capture-failed",
    };
  }

  if (!isLocationObservation(observation)) {
    throw new Error("location-observation-invalid");
  }
  return persistBeforeDelivery(input.database, input.runId, input.startedAt, observation);
}

function canonicalObservation(observation: LocationObservation): CanonicalJsonObject {
  const base = {
    observationId: observation.observationId,
    recordedAt: observation.recordedAt,
    availability: observation.availability,
  };
  if (observation.availability === "available") {
    return {
      ...base,
      capturedAt: observation.capturedAt,
      ageMs: observation.ageMs,
      latitude: observation.latitude,
      longitude: observation.longitude,
      horizontalAccuracy: observation.horizontalAccuracy,
    };
  }
  if (observation.availability === "failed") {
    return { ...base, diagnosticCode: observation.diagnosticCode };
  }
  return base;
}

export function foregroundLocationCapabilityRegistration(
  input: CaptureForegroundLocationInput,
): CapabilityRegistration {
  return {
    capability: FOREGROUND_LOCATION_CAPABILITY,
    validateInput: isLocationRequestInput,
    invoke: async () => canonicalObservation(await captureForegroundLocation(input)),
    validateOutput: isLocationObservation,
  };
}
