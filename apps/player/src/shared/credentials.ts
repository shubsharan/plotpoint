import * as SecureStore from "expo-secure-store";

export interface ParticipantCredentialStore {
  create(sessionId: string): Promise<string>;
  get(sessionId: string): Promise<string | null>;
  remove(sessionId: string): Promise<void>;
  getOrCreateJoinRequestId(sessionId: string): Promise<string>;
}

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return globalThis.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createParticipantCredentialStore(): ParticipantCredentialStore {
  const key = (sessionId: string) => `plotpoint.shared.${sessionId}.credential`;
  const joinKey = (sessionId: string) => `plotpoint.shared.${sessionId}.join-request`;
  return {
    async create(sessionId) {
      const credential = randomSecret();
      await SecureStore.setItemAsync(key(sessionId), credential, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      return credential;
    },
    get: (sessionId) => SecureStore.getItemAsync(key(sessionId)),
    remove: (sessionId) => SecureStore.deleteItemAsync(key(sessionId)),
    async getOrCreateJoinRequestId(sessionId) {
      const existing = await SecureStore.getItemAsync(joinKey(sessionId));
      if (existing !== null) return existing;
      const requestId = `join-${randomSecret()}`;
      await SecureStore.setItemAsync(joinKey(sessionId), requestId, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      return requestId;
    },
  };
}
