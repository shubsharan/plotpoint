import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-file-system/legacy", () => ({}));

import {
  MAX_RELEASE_BYTES,
  createReleaseArtifact,
  type HostReleaseSupport,
  type ReleaseArtifact,
} from "@plotpoint/protocol";

import { installReleaseFromDescriptor } from "../src/install/install-release";
import {
  createNativeInstallationPublisher,
  createNativeInstallTransport,
  type InstallFetch,
  type NativeInstallFileSystem,
} from "../src/install/native-adapters";
import type { InstalledReleaseRecord } from "../src/model";

const descriptorUrl = "http://127.0.0.1:4000/install.json";
const releaseUrl = "http://127.0.0.1:4000/release.pprelease";
const support: HostReleaseSupport = {
  releaseFormatVersions: [1],
  hostApi: { major: 1, minor: 0 },
  aggregateSchemas: [],
  capabilities: [],
};

async function releaseFixture(): Promise<ReleaseArtifact> {
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
  if ("kind" in artifact) throw new Error("release-fixture-invalid");
  return artifact;
}

function response(url: string, body: Uint8Array, status = 200): Response {
  const value = new Response(Uint8Array.from(body).buffer, { status });
  Object.defineProperty(value, "url", { value: url });
  return value;
}

function transportFor(artifact: ReleaseArtifact, overrides?: { descriptor?: unknown }) {
  return {
    fetchJson: vi.fn(async (_url: string, _deadlineMs: number) => ({
      finalUrl: descriptorUrl,
      value: overrides?.descriptor ?? {
        version: 1,
        releaseUrl,
        expectedReleaseId: artifact.releaseId,
      },
    })),
    fetchBytes: vi.fn(async (_url: string, _maximumBytes: number, _deadlineMs: number) => ({
      finalUrl: releaseUrl,
      bytes: artifact.bytes,
    })),
  };
}

class MemoryFileSystem implements NativeInstallFileSystem {
  readonly documentDirectory = "file:///documents/";
  readonly EncodingType = { Base64: "base64" as const };
  readonly directories = new Set<string>();
  readonly files = new Map<string, string>();
  failWrite = false;
  peerWinsNextMove = false;

  async makeDirectoryAsync(uri: string): Promise<void> {
    this.directories.add(uri);
  }

  async deleteAsync(uri: string): Promise<void> {
    for (const path of this.directories) if (path.startsWith(uri)) this.directories.delete(path);
    for (const path of this.files.keys()) if (path.startsWith(uri)) this.files.delete(path);
  }

  async writeAsStringAsync(uri: string, value: string): Promise<void> {
    if (this.failWrite && uri.includes(".candidate/")) throw new Error("write-interrupted");
    this.files.set(uri, value);
  }

  async getInfoAsync(uri: string): Promise<{ readonly exists: boolean }> {
    return { exists: this.directories.has(uri) || this.files.has(uri) };
  }

  async moveAsync({ from, to }: { readonly from: string; readonly to: string }): Promise<void> {
    if (this.peerWinsNextMove) {
      this.peerWinsNextMove = false;
      this.directories.add(to);
      this.files.set(`${to}release.pprelease`, "peer-published");
      throw new Error("destination-exists");
    }
    if (this.directories.has(to)) throw new Error("destination-exists");
    this.directories.add(to);
    for (const [path, value] of this.files) {
      if (path.startsWith(from)) {
        this.files.set(`${to}${path.slice(from.length)}`, value);
        this.files.delete(path);
      }
    }
    await this.deleteAsync(from);
  }
}

describe("player installation policy", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("uses one combined deadline for descriptor and release retrieval", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const artifact = await releaseFixture();
    const transport = transportFor(artifact);
    await expect(
      installReleaseFromDescriptor({
        descriptorUrl,
        support,
        transport,
        publisher: { publish: async () => undefined },
      }),
    ).resolves.toMatchObject({ kind: "installed" });
    expect(transport.fetchJson.mock.calls[0]?.[1]).toBe(31_000);
    expect(transport.fetchBytes.mock.calls[0]?.[2]).toBe(31_000);
  });

  it("does not reset the deadline after descriptor retrieval", async () => {
    let now = 1_000;
    const descriptor = new TextEncoder().encode(JSON.stringify({ value: 1 }));
    const fetcher = vi
      .fn<InstallFetch>()
      .mockResolvedValueOnce(response(descriptorUrl, descriptor))
      .mockResolvedValueOnce(response(releaseUrl, new Uint8Array([1])));
    const transport = createNativeInstallTransport({ fetch: fetcher, now: () => now });
    await expect(transport.fetchJson(descriptorUrl, 31_000)).resolves.toBeDefined();
    now = 31_000;
    await expect(transport.fetchBytes(releaseUrl, MAX_RELEASE_BYTES, 31_000)).rejects.toThrow(
      "install-network-deadline-exceeded",
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("enforces the 64 KiB descriptor and streaming release limits", async () => {
    const valid = new TextEncoder().encode(`${JSON.stringify({ value: 1 })}${" ".repeat(65_525)}`);
    const fetcher = vi
      .fn<InstallFetch>()
      .mockResolvedValueOnce(response(descriptorUrl, valid))
      .mockResolvedValueOnce(response(descriptorUrl, new Uint8Array(65_537)))
      .mockResolvedValueOnce(response(releaseUrl, new Uint8Array([1, 2, 3, 4])));
    const transport = createNativeInstallTransport({ fetch: fetcher, now: () => 0 });
    await expect(transport.fetchJson(descriptorUrl, 1_000)).resolves.toMatchObject({
      value: { value: 1 },
    });
    await expect(transport.fetchJson(descriptorUrl, 1_000)).rejects.toThrow(
      "install-descriptor-too-large",
    );
    await expect(transport.fetchBytes(releaseUrl, 3, 1_000)).rejects.toThrow(
      "install-release-too-large",
    );
    expect(MAX_RELEASE_BYTES).toBe(64 * 1024 * 1024);
  });

  it("rejects redirects, expired deadlines, and cross-origin release URLs", async () => {
    const redirecting = createNativeInstallTransport({
      fetch: vi
        .fn<InstallFetch>()
        .mockResolvedValue(response(descriptorUrl, new Uint8Array(), 302)),
      now: () => 10,
    });
    await expect(redirecting.fetchJson(descriptorUrl, 20)).rejects.toThrow(
      "install-descriptor-redirected",
    );
    await expect(redirecting.fetchJson(descriptorUrl, 10)).rejects.toThrow(
      "install-network-deadline-exceeded",
    );

    const artifact = await releaseFixture();
    const transport = transportFor(artifact, {
      descriptor: {
        version: 1,
        releaseUrl: "http://127.0.0.1:5000/release.pprelease",
        expectedReleaseId: artifact.releaseId,
      },
    });
    const publish = vi.fn(async () => undefined);
    await expect(
      installReleaseFromDescriptor({ descriptorUrl, support, transport, publisher: { publish } }),
    ).resolves.toEqual({ kind: "invalid", code: "install-release-origin-mismatch" });
    expect(publish).not.toHaveBeenCalled();
  });

  it("preserves prior publication on redirects, identity mismatch, and incompatibility", async () => {
    const artifact = await releaseFixture();
    const prior = { releaseId: "prior" };
    const publish = vi.fn(async () => undefined);

    const redirected = transportFor(artifact);
    redirected.fetchBytes.mockResolvedValueOnce({
      finalUrl: `${releaseUrl}?redirected=1`,
      bytes: artifact.bytes,
    });
    await expect(
      installReleaseFromDescriptor({
        descriptorUrl,
        support,
        transport: redirected,
        publisher: { publish },
      }),
    ).resolves.toMatchObject({ kind: "invalid" });

    const mismatched = transportFor(artifact, {
      descriptor: { version: 1, releaseUrl, expectedReleaseId: `sha256:${"0".repeat(64)}` },
    });
    await expect(
      installReleaseFromDescriptor({
        descriptorUrl,
        support,
        transport: mismatched,
        publisher: { publish },
      }),
    ).resolves.toMatchObject({ kind: "invalid" });

    await expect(
      installReleaseFromDescriptor({
        descriptorUrl,
        support: { ...support, hostApi: { major: 2, minor: 0 } },
        transport: transportFor(artifact),
        publisher: { publish },
      }),
    ).resolves.toMatchObject({ kind: "invalid" });
    expect(publish).not.toHaveBeenCalled();
    expect(prior).toEqual({ releaseId: "prior" });
  });

  it("cleans interrupted candidates without touching a prior installation", async () => {
    const artifact = await releaseFixture();
    const fileSystem = new MemoryFileSystem();
    const prior = "file:///documents/releases/prior/";
    fileSystem.directories.add(prior);
    fileSystem.failWrite = true;
    const database = {
      publishRelease: vi.fn(async (_record: InstalledReleaseRecord) => undefined),
    };
    const publisher = createNativeInstallationPublisher(database, {
      fileSystem,
      stagingId: () => "interrupted",
    });
    await expect(
      publisher.publish({
        descriptor: { version: 1, releaseUrl, expectedReleaseId: artifact.releaseId },
        bytes: artifact.bytes,
        manifest: artifact.manifest,
      }),
    ).rejects.toThrow("write-interrupted");
    expect(fileSystem.directories.has(prior)).toBe(true);
    expect([...fileSystem.directories].some((path) => path.includes(".candidate/"))).toBe(false);
    expect(database.publishRelease).not.toHaveBeenCalled();
  });

  it("uses unique staging and resolves concurrent same-release publication idempotently", async () => {
    const artifact = await releaseFixture();
    const fileSystem = new MemoryFileSystem();
    const database = {
      publishRelease: vi.fn(async (_record: InstalledReleaseRecord) => undefined),
    };
    let sequence = 0;
    const publisher = createNativeInstallationPublisher(database, {
      fileSystem,
      stagingId: () => `race-${++sequence}`,
      installedAt: () => "2026-08-03T00:00:00.000Z",
    });
    const input = {
      descriptor: { version: 1 as const, releaseUrl, expectedReleaseId: artifact.releaseId },
      bytes: artifact.bytes,
      manifest: artifact.manifest,
    };
    await Promise.all([publisher.publish(input), publisher.publish(input)]);
    const published = `file:///documents/releases/${artifact.releaseId.slice("sha256:".length)}/`;
    expect(fileSystem.directories.has(published)).toBe(true);
    expect([...fileSystem.directories].some((path) => path.includes(".candidate/"))).toBe(false);
    expect(database.publishRelease).toHaveBeenCalledTimes(2);
    expect(new Set(database.publishRelease.mock.calls.map(([record]) => record.releaseId))).toEqual(
      new Set([artifact.releaseId]),
    );
  });

  it("cleans its unique candidate when a peer wins immediately before atomic move", async () => {
    const artifact = await releaseFixture();
    const fileSystem = new MemoryFileSystem();
    fileSystem.peerWinsNextMove = true;
    const database = {
      publishRelease: vi.fn(async (_record: InstalledReleaseRecord) => undefined),
    };
    const publisher = createNativeInstallationPublisher(database, {
      fileSystem,
      stagingId: () => "losing-racer",
    });
    await expect(
      publisher.publish({
        descriptor: { version: 1, releaseUrl, expectedReleaseId: artifact.releaseId },
        bytes: artifact.bytes,
        manifest: artifact.manifest,
      }),
    ).resolves.toBeUndefined();
    expect([...fileSystem.directories].some((path) => path.includes(".candidate/"))).toBe(false);
    expect(database.publishRelease).toHaveBeenCalledOnce();
  });
});
