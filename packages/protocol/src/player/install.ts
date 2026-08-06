import { isReleaseId } from "../release/identity.js";
import type { ReleaseId } from "../release/types.js";

export const MAX_RELEASE_BYTES = 64 * 1024 * 1024;
export const RELEASE_DOWNLOAD_TIMEOUT_MS = 30_000;

export interface InstallDescriptor {
  readonly releaseUrl: string;
  readonly expectedReleaseId: ReleaseId;
}

export type InstallDescriptorResult =
  | { readonly kind: "valid"; readonly descriptor: InstallDescriptor }
  | { readonly kind: "invalid"; readonly code: string; readonly field: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [first, second] = octets as [number, number, number, number];
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export function isEligibleInstallUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      url.username === "" &&
      url.password === "" &&
      url.hash === "" &&
      isPrivateIpv4(url.hostname)
    );
  } catch {
    return false;
  }
}

export function parseInstallDescriptor(value: unknown): InstallDescriptorResult {
  if (!isPlainObject(value) || !hasExactKeys(value, ["expectedReleaseId", "releaseUrl"])) {
    return { kind: "invalid", code: "install-descriptor-shape-invalid", field: "" };
  }
  if (typeof value.releaseUrl !== "string" || !isEligibleInstallUrl(value.releaseUrl)) {
    return { kind: "invalid", code: "install-release-url-ineligible", field: "releaseUrl" };
  }
  if (typeof value.expectedReleaseId !== "string" || !isReleaseId(value.expectedReleaseId)) {
    return {
      kind: "invalid",
      code: "install-release-identity-invalid",
      field: "expectedReleaseId",
    };
  }
  return {
    kind: "valid",
    descriptor: Object.freeze({
      releaseUrl: value.releaseUrl,
      expectedReleaseId: value.expectedReleaseId,
    }),
  };
}
