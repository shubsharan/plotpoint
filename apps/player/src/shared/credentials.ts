import * as SecureStore from "expo-secure-store";

export interface ParticipantCredentialStore {
  generateJoinRequestId(): string;
  generateCredential(): string;
  putCredential(key: string, credential: string): Promise<void>;
  getCredential(key: string): Promise<string | null>;
  removeCredential(key: string): Promise<void>;
  putInvitation(key: string, invitation: string): Promise<void>;
  getInvitation(key: string): Promise<string | null>;
  removeInvitation(key: string): Promise<void>;
}

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
    putCredential: put,
    getCredential: (key) => SecureStore.getItemAsync(key),
    removeCredential: (key) => SecureStore.deleteItemAsync(key),
    putInvitation: put,
    getInvitation: (key) => SecureStore.getItemAsync(key),
    removeInvitation: (key) => SecureStore.deleteItemAsync(key),
  };
}
