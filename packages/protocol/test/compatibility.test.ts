import { describe, expect, it } from "vitest";

import {
  assessCompatibility,
  type HostReleaseSupport,
  type ReleaseManifest,
} from "@plotpoint/protocol";

const playerDigest = `sha256:${"a".repeat(64)}` as const;
const teamDigest = `sha256:${"b".repeat(64)}` as const;

function manifest(): ReleaseManifest {
  return {
    releaseFormatVersion: 1,
    hostApi: { major: 2, minimumMinor: 3 },
    aggregateSchemas: [
      { id: "puzzle.player", kind: "player", path: "schemas/player.json" },
      { id: "puzzle.team", kind: "team", path: "schemas/team.json" },
    ],
    capabilities: [
      { id: "plotpoint.media.playback", major: 1, minimumMinor: 2 },
      { id: "plotpoint.sensors.location", major: 3, minimumMinor: 1 },
    ],
    entrypoints: { logic: "bundles/logic.js", presentation: "bundles/presentation.js" },
    inventory: [
      {
        path: "schemas/player.json",
        kind: "aggregate-schema",
        byteLength: 1,
        digest: playerDigest,
      },
      { path: "schemas/team.json", kind: "aggregate-schema", byteLength: 1, digest: teamDigest },
    ],
  };
}

function support(): HostReleaseSupport {
  return {
    releaseFormatVersions: [1],
    hostApi: { major: 2, minor: 3 },
    aggregateSchemas: [
      { id: "puzzle.player", kind: "player", digest: playerDigest },
      { id: "puzzle.team", kind: "team", digest: teamDigest },
    ],
    capabilities: [
      { id: "plotpoint.media.playback", major: 1, minor: 2 },
      { id: "plotpoint.sensors.location", major: 3, minor: 1 },
    ],
  };
}

describe("release compatibility assessment", () => {
  it("accepts exact format/schema digests and minimum host/capability minors", () => {
    expect(assessCompatibility(manifest(), support())).toEqual({ kind: "compatible" });
  });

  it("matches exact schema and capability tuples rather than the first same-ID declaration", () => {
    const host = support();
    expect(
      assessCompatibility(manifest(), {
        ...host,
        aggregateSchemas: [
          { id: "puzzle.player", kind: "player", digest: teamDigest },
          ...host.aggregateSchemas,
        ],
        capabilities: [
          { id: "plotpoint.media.playback", major: 2, minor: 99 },
          ...host.capabilities,
        ],
      }),
    ).toEqual({ kind: "compatible" });
  });

  it.each([
    ["release format", { releaseFormatVersions: [2] }, "release-format-unsupported"],
    ["host API major", { hostApi: { major: 3, minor: 99 } }, "host-api-unsupported"],
    ["host API minor", { hostApi: { major: 2, minor: 2 } }, "host-api-unsupported"],
    ["aggregate identity", { aggregateSchemas: [] }, "aggregate-schema-unsupported"],
    [
      "aggregate kind",
      { aggregateSchemas: [{ id: "puzzle.player", kind: "team", digest: playerDigest }] },
      "aggregate-schema-unsupported",
    ],
    [
      "aggregate digest",
      { aggregateSchemas: [{ id: "puzzle.player", kind: "player", digest: teamDigest }] },
      "aggregate-schema-unsupported",
    ],
    ["capability identity", { capabilities: [] }, "capability-unsupported"],
    [
      "capability major",
      { capabilities: [{ id: "plotpoint.media.playback", major: 2, minor: 99 }] },
      "capability-unsupported",
    ],
    [
      "capability minor",
      { capabilities: [{ id: "plotpoint.media.playback", major: 1, minor: 1 }] },
      "capability-unsupported",
    ],
  ] as const)("rejects an unsupported %s independently", (_name, replacement, code) => {
    const host = support();
    const assessment = assessCompatibility(manifest(), { ...host, ...replacement });

    expect(assessment.kind).toBe("incompatible");
    if (assessment.kind === "incompatible") {
      expect(assessment.diagnostics.map((diagnostic) => diagnostic.code)).toContain(code);
    }
  });

  it("reports every incompatible surface without best-effort fallback", () => {
    const assessment = assessCompatibility(manifest(), {
      releaseFormatVersions: [2],
      hostApi: { major: 1, minor: 0 },
      aggregateSchemas: [],
      capabilities: [],
    });

    expect(assessment).toMatchObject({
      kind: "incompatible",
      diagnostics: [
        { code: "release-format-unsupported", relationship: "release-format" },
        { code: "host-api-unsupported", relationship: "host-api" },
        { code: "aggregate-schema-unsupported", relationship: "aggregate-schema:puzzle.player" },
        { code: "aggregate-schema-unsupported", relationship: "aggregate-schema:puzzle.team" },
        { code: "capability-unsupported", relationship: "capability:plotpoint.media.playback" },
        { code: "capability-unsupported", relationship: "capability:plotpoint.sensors.location" },
      ],
    });
  });
});
