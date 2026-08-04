import { describe, expect, it, vi } from "vitest";

import { createReleaseArtifact, type HostReleaseSupport } from "@plotpoint/protocol";

import { installReleaseFromDescriptor } from "../src/install/install-release";

const support: HostReleaseSupport = {
  releaseFormatVersions: [1],
  hostApi: { major: 1, minor: 0 },
  aggregateSchemas: [],
  capabilities: [],
};

describe("player installation policy", () => {
  it("verifies expected identity before publication", async () => {
    const artifact = await createReleaseArtifact({
      hostApi: { major: 1, minimumMinor: 0 },
      aggregateSchemas: [],
      capabilities: [],
      entrypoints: { logic: "bundles/logic.js", presentation: "bundles/presentation.js" },
      entries: [
        {
          path: "bundles/logic.js",
          kind: "logic-bundle",
          bytes: new TextEncoder().encode("export default {}"),
        },
        {
          path: "bundles/presentation.js",
          kind: "presentation-bundle",
          bytes: new TextEncoder().encode("export default {}"),
        },
      ],
    });
    if ("kind" in artifact) throw new Error("fixture failed");
    const publish = vi.fn(async () => undefined);
    const descriptorUrl = "http://127.0.0.1:4000/install.json";
    const releaseUrl = "http://127.0.0.1:4000/release.pprelease";
    const result = await installReleaseFromDescriptor({
      descriptorUrl,
      support,
      publisher: { publish },
      transport: {
        fetchJson: async () => ({
          finalUrl: descriptorUrl,
          value: { version: 1, releaseUrl, expectedReleaseId: artifact.releaseId },
        }),
        fetchBytes: async () => ({ finalUrl: releaseUrl, bytes: artifact.bytes }),
      },
    });
    expect(result.kind).toBe("installed");
    expect(publish).toHaveBeenCalledOnce();
  });

  it("rejects redirected descriptors before publication", async () => {
    const publish = vi.fn(async () => undefined);
    const result = await installReleaseFromDescriptor({
      descriptorUrl: "http://127.0.0.1/install.json",
      support,
      publisher: { publish },
      transport: {
        fetchJson: async () => ({ finalUrl: "http://127.0.0.1/other.json", value: {} }),
        fetchBytes: async () => {
          throw new Error("not reached");
        },
      },
    });
    expect(result).toEqual({ kind: "invalid", code: "install-descriptor-redirected" });
    expect(publish).not.toHaveBeenCalled();
  });

  it("rejects a wrong expected identity and unsupported host compatibility", async () => {
    const artifact = await createReleaseArtifact({
      hostApi: { major: 1, minimumMinor: 0 },
      aggregateSchemas: [],
      capabilities: [],
      entrypoints: { logic: "bundles/logic.js", presentation: "bundles/presentation.js" },
      entries: [
        {
          path: "bundles/logic.js",
          kind: "logic-bundle",
          bytes: new TextEncoder().encode("export default {}"),
        },
        {
          path: "bundles/presentation.js",
          kind: "presentation-bundle",
          bytes: new TextEncoder().encode("export default {}"),
        },
      ],
    });
    if ("kind" in artifact) throw new Error("fixture failed");
    const publish = vi.fn(async () => undefined);
    const descriptorUrl = "http://127.0.0.1/install.json";
    const releaseUrl = "http://127.0.0.1/release.pprelease";
    const transport = {
      fetchJson: async () => ({
        finalUrl: descriptorUrl,
        value: {
          version: 1,
          releaseUrl,
          expectedReleaseId: `sha256:${"0".repeat(64)}`,
        },
      }),
      fetchBytes: async () => ({ finalUrl: releaseUrl, bytes: artifact.bytes }),
    };
    await expect(
      installReleaseFromDescriptor({ descriptorUrl, support, publisher: { publish }, transport }),
    ).resolves.toMatchObject({ kind: "invalid" });

    const validIdentityTransport = {
      ...transport,
      fetchJson: async () => ({
        finalUrl: descriptorUrl,
        value: { version: 1, releaseUrl, expectedReleaseId: artifact.releaseId },
      }),
    };
    await expect(
      installReleaseFromDescriptor({
        descriptorUrl,
        support: { ...support, releaseFormatVersions: [] },
        publisher: { publish },
        transport: validIdentityTransport,
      }),
    ).resolves.toMatchObject({ kind: "invalid" });
    expect(publish).not.toHaveBeenCalled();
  });

  it("does not publish when a bounded transport times out or is interrupted", async () => {
    const publish = vi.fn(async () => undefined);
    const failure = new Error("install-release-timeout");
    await expect(
      installReleaseFromDescriptor({
        descriptorUrl: "http://127.0.0.1/install.json",
        support,
        publisher: { publish },
        transport: {
          fetchJson: async () => {
            throw failure;
          },
          fetchBytes: async () => {
            throw new Error("not reached");
          },
        },
      }),
    ).rejects.toThrow("install-release-timeout");
    expect(publish).not.toHaveBeenCalled();
  });
});
