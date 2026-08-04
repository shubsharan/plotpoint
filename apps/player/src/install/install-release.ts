import {
  MAX_RELEASE_BYTES,
  RELEASE_DOWNLOAD_TIMEOUT_MS,
  assessCompatibility,
  isEligibleInstallUrl,
  parseInstallDescriptor,
  verifyRelease,
  type HostReleaseSupport,
  type InstallDescriptorV1,
  type ReleaseManifestV1,
} from "@plotpoint/protocol";

export interface FetchedJson {
  readonly finalUrl: string;
  readonly value: unknown;
}

export interface FetchedBytes {
  readonly finalUrl: string;
  readonly bytes: Uint8Array;
}

export interface InstallTransport {
  fetchJson(url: string, timeoutMs: number): Promise<FetchedJson>;
  fetchBytes(url: string, maximumBytes: number, timeoutMs: number): Promise<FetchedBytes>;
}

export interface InstallationPublisher {
  publish(input: {
    readonly descriptor: InstallDescriptorV1;
    readonly bytes: Uint8Array;
    readonly manifest: ReleaseManifestV1;
  }): Promise<void>;
}

export type InstallReleaseResult =
  | { readonly kind: "installed"; readonly descriptor: InstallDescriptorV1 }
  | { readonly kind: "invalid"; readonly code: string };

export async function installReleaseFromDescriptor(input: {
  readonly descriptorUrl: string;
  readonly transport: InstallTransport;
  readonly publisher: InstallationPublisher;
  readonly support: HostReleaseSupport;
}): Promise<InstallReleaseResult> {
  if (!isEligibleInstallUrl(input.descriptorUrl)) {
    return { kind: "invalid", code: "install-descriptor-url-ineligible" };
  }
  const fetchedDescriptor = await input.transport.fetchJson(
    input.descriptorUrl,
    RELEASE_DOWNLOAD_TIMEOUT_MS,
  );
  if (fetchedDescriptor.finalUrl !== input.descriptorUrl) {
    return { kind: "invalid", code: "install-descriptor-redirected" };
  }
  const parsed = parseInstallDescriptor(fetchedDescriptor.value);
  if (parsed.kind === "invalid") return { kind: "invalid", code: parsed.code };

  const fetchedRelease = await input.transport.fetchBytes(
    parsed.descriptor.releaseUrl,
    MAX_RELEASE_BYTES,
    RELEASE_DOWNLOAD_TIMEOUT_MS,
  );
  if (fetchedRelease.finalUrl !== parsed.descriptor.releaseUrl) {
    return { kind: "invalid", code: "install-release-redirected" };
  }
  if (fetchedRelease.bytes.byteLength > MAX_RELEASE_BYTES) {
    return { kind: "invalid", code: "install-release-too-large" };
  }
  const verified = await verifyRelease({
    bytes: fetchedRelease.bytes,
    expectedReleaseId: parsed.descriptor.expectedReleaseId,
  });
  if (verified.kind === "invalid") {
    return { kind: "invalid", code: verified.diagnostics[0]?.code ?? "install-release-invalid" };
  }
  const compatibility = assessCompatibility(verified.manifest, input.support);
  if (compatibility.kind === "incompatible") {
    return {
      kind: "invalid",
      code: compatibility.diagnostics[0]?.code ?? "install-release-incompatible",
    };
  }
  await input.publisher.publish({
    descriptor: parsed.descriptor,
    bytes: fetchedRelease.bytes,
    manifest: verified.manifest,
  });
  return { kind: "installed", descriptor: parsed.descriptor };
}
