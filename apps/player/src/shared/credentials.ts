import * as SecureStore from "expo-secure-store";

export interface ParticipantCredentialStore {
  generateJoinRequestId(): string;
  generateCredential(): string;
  putEnvelope(key: string, envelope: SharedSecretEnvelope): Promise<void>;
  getEnvelope(key: string): Promise<SharedSecretEnvelope | null>;
  removeEnvelope(key: string): Promise<void>;
}

export type SharedSecretEnvelope =
  | {
      readonly kind: "pending";
      readonly sessionId: string;
      readonly expectedReleaseId: `sha256:${string}`;
      readonly serviceOrigin: string;
      readonly joinRequestId: string;
      readonly invitation: string;
      readonly participantCredential: string;
    }
  | { readonly kind: "bound"; readonly participantCredential: string };

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return globalThis.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createParticipantCredentialStore(): ParticipantCredentialStore {
  const put = (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  return {
    generateJoinRequestId: () => `join-${randomSecret()}`,
    generateCredential: randomSecret,
    putEnvelope: (key, envelope) => put(key, JSON.stringify(envelope)),
    getEnvelope: async (key) => {
      const stored = await SecureStore.getItemAsync(key);
      if (stored === null) return null;
      const value: unknown = JSON.parse(stored);
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("shared-secret-envelope-invalid");
      }
      const envelope = value as Record<string, unknown>;
      if (
        envelope.kind === "bound" &&
        typeof envelope.participantCredential === "string" &&
        envelope.participantCredential.length > 0
      )
        return envelope as SharedSecretEnvelope;
      if (
        envelope.kind === "pending" &&
        [
          "sessionId",
          "expectedReleaseId",
          "serviceOrigin",
          "joinRequestId",
          "invitation",
          "participantCredential",
        ].every(
          (field) => typeof envelope[field] === "string" && (envelope[field] as string).length > 0,
        )
      )
        return envelope as SharedSecretEnvelope;
      throw new Error("shared-secret-envelope-invalid");
    },
    removeEnvelope: (key) => SecureStore.deleteItemAsync(key),
  };
}
