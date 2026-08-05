import type {
  CanonicalJsonObject,
  CompatibilityAssessment,
  HostReleaseSupport,
  ReleaseDiagnostic,
  ReleaseManifest,
} from "./types.js";

function diagnostic(
  code: string,
  relationship: string,
  details: CanonicalJsonObject,
): ReleaseDiagnostic {
  return Object.freeze({
    category: "compatibility",
    code,
    relationship,
    details: Object.freeze(details),
  });
}

export function assessCompatibility(
  manifest: ReleaseManifest,
  support: HostReleaseSupport,
): CompatibilityAssessment {
  const diagnostics: ReleaseDiagnostic[] = [];

  if (!support.releaseFormatVersions.includes(manifest.releaseFormatVersion)) {
    diagnostics.push(
      diagnostic("release-format-unsupported", "release-format", {
        required: manifest.releaseFormatVersion,
        supported: Object.freeze([...support.releaseFormatVersions]),
      }),
    );
  }

  if (
    support.hostApi.major !== manifest.hostApi.major ||
    support.hostApi.minor < manifest.hostApi.minimumMinor
  ) {
    diagnostics.push(
      diagnostic("host-api-unsupported", "host-api", {
        requiredMajor: manifest.hostApi.major,
        requiredMinimumMinor: manifest.hostApi.minimumMinor,
        supportedMajor: support.hostApi.major,
        supportedMinor: support.hostApi.minor,
      }),
    );
  }

  for (const required of manifest.aggregateSchemas) {
    const available = support.aggregateSchemas.filter(
      ({ id, kind }) => id === required.id && kind === required.kind,
    );
    if (!available.some(({ versions }) => versions.includes(required.version))) {
      diagnostics.push(
        diagnostic("aggregate-schema-unsupported", `aggregate-schema:${required.id}`, {
          id: required.id,
          kind: required.kind,
          requiredVersion: required.version,
          supportedVersions: Object.freeze(available.flatMap(({ versions }) => [...versions])),
        }),
      );
    }
  }

  for (const required of manifest.capabilities) {
    const exact = support.capabilities.find(
      ({ id, major }) => id === required.id && major === required.major,
    );
    if (exact === undefined || exact.minor < required.minimumMinor) {
      const sameId = exact ?? support.capabilities.find(({ id }) => id === required.id);
      diagnostics.push(
        diagnostic("capability-unsupported", `capability:${required.id}`, {
          id: required.id,
          requiredMajor: required.major,
          requiredMinimumMinor: required.minimumMinor,
          ...(sameId === undefined
            ? {}
            : { supportedMajor: sameId.major, supportedMinor: sameId.minor }),
        }),
      );
    }
  }

  if (diagnostics.length === 0) return Object.freeze({ kind: "compatible" });
  return Object.freeze({ kind: "incompatible", diagnostics: Object.freeze(diagnostics) });
}
