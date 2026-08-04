import * as FileSystem from "expo-file-system/legacy";

import { openRelease, type ReleaseManifestV1 } from "@plotpoint/protocol";

import type { PlayerDatabase } from "../persistence/database";
import type { InstallTransport, InstallationPublisher } from "./install-release";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return globalThis.btoa(binary);
}

async function withTimedFetch<T>(
  url: string,
  timeoutMs: number,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    });
    return await read(response);
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedBytes(response: Response, maximumBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maximumBytes) throw new Error("install-release-too-large");
  if (response.body === null) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) throw new Error("install-release-too-large");
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const item = await reader.read();
    if (item.done) break;
    total += item.value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("install-release-too-large");
      throw new Error("install-release-too-large");
    }
    chunks.push(item.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function createNativeInstallTransport(): InstallTransport {
  return {
    async fetchJson(url, timeoutMs) {
      return withTimedFetch(url, timeoutMs, async (response) => {
        if (!response.ok) throw new Error(`install-descriptor-http-${response.status}`);
        const text = await response.text();
        if (text.length > 65_536) throw new Error("install-descriptor-too-large");
        return { finalUrl: response.url, value: JSON.parse(text) as unknown };
      });
    },
    async fetchBytes(url, maximumBytes, timeoutMs) {
      return withTimedFetch(url, timeoutMs, async (response) => {
        if (!response.ok) throw new Error(`install-release-http-${response.status}`);
        const bytes = await readBoundedBytes(response, maximumBytes);
        return { finalUrl: response.url, bytes };
      });
    },
  };
}

export function createNativeInstallationPublisher(database: PlayerDatabase): InstallationPublisher {
  return {
    async publish(input: {
      descriptor: { expectedReleaseId: string };
      bytes: Uint8Array;
      manifest: ReleaseManifestV1;
    }) {
      if (FileSystem.documentDirectory === null) throw new Error("install-storage-unavailable");
      const digest = input.descriptor.expectedReleaseId.slice("sha256:".length);
      const root = `${FileSystem.documentDirectory}releases/`;
      const candidate = `${root}.${digest}.candidate/`;
      const published = `${root}${digest}/`;
      await FileSystem.makeDirectoryAsync(root, { intermediates: true });
      await FileSystem.deleteAsync(candidate, { idempotent: true });
      await FileSystem.makeDirectoryAsync(candidate, { intermediates: true });
      const candidateArtifact = `${candidate}release.pprelease`;
      await FileSystem.writeAsStringAsync(candidateArtifact, bytesToBase64(input.bytes), {
        encoding: FileSystem.EncodingType.Base64,
      });
      const opened = await openRelease(input.bytes);
      if (opened.kind === "invalid") throw new Error("install-candidate-open-failed");
      for (const entry of opened.entries) {
        const entryUri = `${candidate}entries/${entry.path}`;
        const separator = entryUri.lastIndexOf("/");
        await FileSystem.makeDirectoryAsync(entryUri.slice(0, separator + 1), {
          intermediates: true,
        });
        await FileSystem.writeAsStringAsync(entryUri, bytesToBase64(entry.bytes), {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      const existing = await FileSystem.getInfoAsync(published);
      if (!existing.exists) await FileSystem.moveAsync({ from: candidate, to: published });
      else await FileSystem.deleteAsync(candidate, { idempotent: true });
      await database.publishRelease({
        releaseId: input.descriptor.expectedReleaseId as `sha256:${string}`,
        artifactUri: `${published}release.pprelease`,
        manifestJson: JSON.stringify(input.manifest),
        installedAt: new Date().toISOString(),
      });
    },
  };
}
