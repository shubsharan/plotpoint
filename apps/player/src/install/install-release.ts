import {
  MAX_RELEASE_BYTES,
  RELEASE_DOWNLOAD_TIMEOUT_MS,
  assessCompatibility,
  isEligibleInstallUrl,
  parseInstallDescriptor,
  verifyRelease,
  type HostReleaseSupport,
  type InstallDescriptor,
  type ReleaseManifest,
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
  fetchJson(url: string, deadlineMs: number): Promise<FetchedJson>;
  fetchBytes(url: string, maximumBytes: number, deadlineMs: number): Promise<FetchedBytes>;
}

export interface InstallationPublisher {
  publish(input: {
    readonly descriptor: InstallDescriptor;
    readonly bytes: Uint8Array;
    readonly manifest: ReleaseManifest;
  }): Promise<void>;
}

export type InstallReleaseResult =
  | { readonly kind: "installed"; readonly descriptor: InstallDescriptor }
  | { readonly kind: "invalid"; readonly code: string };

export async function installReleaseFromDescriptor(input: {
  readonly descriptorUrl: string;
  readonly transport: InstallTransport;
  readonly publisher: InstallationPublisher;
  readonly support: HostReleaseSupport | ((manifest: ReleaseManifest) => HostReleaseSupport);
}): Promise<InstallReleaseResult> {
  if (!isEligibleInstallUrl(input.descriptorUrl)) {
    return { kind: "invalid", code: "install-descriptor-url-ineligible" };
  }
  const deadlineMs = Date.now() + RELEASE_DOWNLOAD_TIMEOUT_MS;
  const fetchedDescriptor = await input.transport.fetchJson(input.descriptorUrl, deadlineMs);
  if (fetchedDescriptor.finalUrl !== input.descriptorUrl) {
    return { kind: "invalid", code: "install-descriptor-redirected" };
  }
  const parsed = parseInstallDescriptor(fetchedDescriptor.value);
  if (parsed.kind === "invalid") return { kind: "invalid", code: parsed.code };
  if (new URL(parsed.descriptor.releaseUrl).origin !== new URL(input.descriptorUrl).origin) {
    return { kind: "invalid", code: "install-release-origin-mismatch" };
  }

  const fetchedRelease = await input.transport.fetchBytes(
    parsed.descriptor.releaseUrl,
    MAX_RELEASE_BYTES,
    deadlineMs,
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
  const support =
    typeof input.support === "function" ? input.support(verified.manifest) : input.support;
  const compatibility = assessCompatibility(verified.manifest, support);
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
