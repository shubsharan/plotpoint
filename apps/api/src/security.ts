import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { CanonicalJsonObject, CanonicalJsonValue } from "@plotpoint/protocol";

function ordered(value: CanonicalJsonValue): CanonicalJsonValue {
  if (Array.isArray(value)) return value.map(ordered);
  if (value !== null && typeof value === "object") {
    const record = value as CanonicalJsonObject;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, ordered(record[key] as CanonicalJsonValue)]),
    );
  }
  return value;
}

export function requestDigest(value: CanonicalJsonValue): string {
  return createHash("sha256")
    .update(JSON.stringify(ordered(value)))
    .digest("hex");
}

export function createOpaqueId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function createSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function isSecret(value: string): boolean {
  try {
    return Buffer.from(value, "base64url").byteLength === 32;
  } catch {
    return false;
  }
}

export function credentialDigest(secret: string, pepper: string): string {
  return createHmac("sha256", pepper).update(secret).digest("hex");
}

export function equalDigest(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}
