/**
 * Converts a base64-encoded string to a Uint8Array.
 * Used for native platforms (iOS/Android) with Expo FileSystem.
 */
import { Buffer } from "buffer";

export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === "function") {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
  }

  // Fallback for environments without `atob`
  return Uint8Array.from(Buffer.from(base64, "base64"));
}
