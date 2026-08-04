import { sha256 } from "@noble/hashes/sha2.js";

import type { ReleaseId, Sha256Digest } from "./types.js";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;

const CRC32_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC32_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC32_TABLE[index] = value >>> 0;
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC32_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function sha256Digest(bytes: Uint8Array): Sha256Digest {
  const digest = sha256(bytes);
  let hexadecimal = "";
  for (const byte of digest) hexadecimal += byte.toString(16).padStart(2, "0");
  return `sha256:${hexadecimal}`;
}

export function computeReleaseId(bytes: Uint8Array): ReleaseId {
  return sha256Digest(bytes);
}

export function isSha256Digest(value: string): value is Sha256Digest {
  return SHA256_PATTERN.test(value);
}

export const isReleaseId = isSha256Digest;
