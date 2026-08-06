import {
  FOREGROUND_LOCATION_CAPABILITY,
  HOST_API_VERSION,
  RELEASE_FORMAT_VERSION,
  type HostReleaseSupport,
  type ReleaseManifest,
} from "@plotpoint/protocol";

const IMPLEMENTED_CAPABILITIES = Object.freeze([FOREGROUND_LOCATION_CAPABILITY]);

function aggregateSchemaSupport(manifest: ReleaseManifest): HostReleaseSupport["aggregateSchemas"] {
  const versionsBySchema = new Map<
    string,
    {
      readonly id: string;
      readonly kind: ReleaseManifest["aggregateSchemas"][number]["kind"];
      readonly versions: number[];
    }
  >();

  for (const requirement of manifest.aggregateSchemas) {
    const key = `${requirement.kind}\0${requirement.id}`;
    const support = versionsBySchema.get(key);
    if (support === undefined) {
      versionsBySchema.set(key, {
        id: requirement.id,
        kind: requirement.kind,
        versions: [requirement.version],
      });
    } else {
      support.versions.push(requirement.version);
    }
  }

  return Object.freeze(
    [...versionsBySchema.values()].map(({ id, kind, versions }) =>
      Object.freeze({ id, kind, versions: Object.freeze(versions) }),
    ),
  );
}

function requiredCapabilitySupport(manifest: ReleaseManifest): HostReleaseSupport["capabilities"] {
  return Object.freeze(
    manifest.capabilities.flatMap((requirement) => {
      const implemented = IMPLEMENTED_CAPABILITIES.find(
        (capability) =>
          capability.id === requirement.id &&
          capability.major === requirement.major &&
          capability.minor >= requirement.minimumMinor,
      );
      return implemented === undefined ? [] : [implemented];
    }),
  );
}

/**
 * Builds the compatibility declaration for a structurally verified manifest.
 * Aggregate schemas are data validated by the generic host; native capabilities
 * remain limited to the player's explicit implementation registry.
 */
export function deriveHostSupportFromManifest(manifest: ReleaseManifest): HostReleaseSupport {
  return Object.freeze({
    releaseFormatVersions: Object.freeze([RELEASE_FORMAT_VERSION]),
    hostApi: HOST_API_VERSION,
    aggregateSchemas: aggregateSchemaSupport(manifest),
    capabilities: requiredCapabilitySupport(manifest),
  });
}
