import { targetDiscoveryConfigReleasePath } from "@plotpoint/modules";
import { createReleaseArtifact } from "@plotpoint/protocol";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { HuntService } from "../src/hunt-service.js";

describe("trusted release registration", () => {
  it("extracts target policy from the compiler-emitted content identity", async () => {
    const artifact = await createReleaseArtifact({
      hostApi: { major: 1, minimumMinor: 1 },
      aggregateSchemas: [],
      capabilities: [],
      entrypoints: { logic: "bundles/logic.js", presentation: "bundles/presentation.js" },
      entries: [
        {
          path: "bundles/logic.js",
          kind: "logic-bundle",
          bytes: new TextEncoder().encode("export {}"),
        },
        {
          path: "bundles/presentation.js",
          kind: "presentation-bundle",
          bytes: new TextEncoder().encode("export {}"),
        },
        {
          path: targetDiscoveryConfigReleasePath(),
          kind: "content",
          value: {
            targets: [
              {
                targetId: "alpha",
                prompt: "Alpha",
                zone: "North",
                latitude: 37,
                longitude: -122,
                radiusMeters: 50,
                maximumAgeMs: 15_000,
                maximumAccuracyMeters: 30,
              },
            ],
          },
        },
      ],
    });
    if ("kind" in artifact) throw new Error("release-fixture-invalid");
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const service = new HuntService({ query } as unknown as Pool, "pepper");
    await expect(service.registerRelease(artifact.bytes, artifact.releaseId)).resolves.toEqual({
      releaseId: artifact.releaseId,
      targetCount: 1,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO release_registrations"),
      expect.arrayContaining([artifact.releaseId]),
    );
  });
});
