import * as FileSystem from "expo-file-system/legacy";

import { openRelease, type ReleaseManifest } from "@plotpoint/protocol";

import type { PlayerDatabase } from "../persistence/database";
import type { InstallTransport, InstallationPublisher } from "./install-release";

const MAX_DESCRIPTOR_BYTES = 64 * 1024;

export interface NativeInstallFileSystem {
  readonly documentDirectory: string | null;
  readonly EncodingType: { readonly Base64: "base64" | string };
  makeDirectoryAsync(uri: string, options: { readonly intermediates: boolean }): Promise<void>;
  deleteAsync(uri: string, options: { readonly idempotent: boolean }): Promise<void>;
  writeAsStringAsync(
    uri: string,
    value: string,
    options: { readonly encoding: string },
  ): Promise<void>;
  getInfoAsync(uri: string): Promise<{ readonly exists: boolean }>;
  moveAsync(input: { readonly from: string; readonly to: string }): Promise<void>;
}

export interface ReleasePublicationStore {
  publishRelease(record: Parameters<PlayerDatabase["publishRelease"]>[0]): Promise<void>;
}

export type InstallFetch = (url: string, init: RequestInit) => Promise<Response>;

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
  deadlineMs: number,
  stage: "descriptor" | "release",
  fetcher: InstallFetch,
  now: () => number,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const remainingMs = deadlineMs - now();
  if (remainingMs <= 0) throw new Error("install-network-deadline-exceeded");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remainingMs);
  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      redirect: "manual",
      cache: "no-store",
    });
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      throw new Error(`install-${stage}-redirected`);
    }
    return await read(response);
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedBytes(
  response: Response,
  maximumBytes: number,
  tooLargeCode: string,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maximumBytes) throw new Error(tooLargeCode);
  if (response.body === null) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) throw new Error(tooLargeCode);
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
      await reader.cancel(tooLargeCode);
      throw new Error(tooLargeCode);
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

export function createNativeInstallTransport(options?: {
  readonly fetch?: InstallFetch;
  readonly now?: () => number;
}): InstallTransport {
  const fetcher: InstallFetch = options?.fetch ?? fetch;
  const now = options?.now ?? Date.now;
  return {
    async fetchJson(url, deadlineMs) {
      return withTimedFetch(url, deadlineMs, "descriptor", fetcher, now, async (response) => {
        if (!response.ok) throw new Error(`install-descriptor-http-${response.status}`);
        const bytes = await readBoundedBytes(
          response,
          MAX_DESCRIPTOR_BYTES,
          "install-descriptor-too-large",
        );
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return { finalUrl: response.url, value: JSON.parse(text) as unknown };
      });
    },
    async fetchBytes(url, maximumBytes, deadlineMs) {
      return withTimedFetch(url, deadlineMs, "release", fetcher, now, async (response) => {
        if (!response.ok) throw new Error(`install-release-http-${response.status}`);
        const bytes = await readBoundedBytes(response, maximumBytes, "install-release-too-large");
        return { finalUrl: response.url, bytes };
      });
    },
  };
}

function stagingIdentity(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function createNativeInstallationPublisher(
  database: ReleasePublicationStore,
  options?: {
    readonly fileSystem?: NativeInstallFileSystem;
    readonly stagingId?: () => string;
    readonly installedAt?: () => string;
  },
): InstallationPublisher {
  const fileSystem = options?.fileSystem ?? (FileSystem as NativeInstallFileSystem);
  const createStagingId = options?.stagingId ?? stagingIdentity;
  const installedAt = options?.installedAt ?? (() => new Date().toISOString());
  return {
    async publish(input: {
      descriptor: { expectedReleaseId: string };
      bytes: Uint8Array;
      manifest: ReleaseManifest;
    }) {
      if (fileSystem.documentDirectory === null) throw new Error("install-storage-unavailable");
      const digest = input.descriptor.expectedReleaseId.slice("sha256:".length);
      const root = `${fileSystem.documentDirectory}releases/`;
      const candidate = `${root}.${digest}.${createStagingId()}.candidate/`;
      const published = `${root}${digest}/`;
      await fileSystem.makeDirectoryAsync(root, { intermediates: true });
      await fileSystem.makeDirectoryAsync(candidate, { intermediates: true });
      let candidatePublished = false;
      try {
        const candidateArtifact = `${candidate}release.pprelease`;
        await fileSystem.writeAsStringAsync(candidateArtifact, bytesToBase64(input.bytes), {
          encoding: fileSystem.EncodingType.Base64,
        });
        const opened = await openRelease(input.bytes);
        if (opened.kind === "invalid") throw new Error("install-candidate-open-failed");
        for (const entry of opened.entries) {
          const entryUri = `${candidate}entries/${entry.path}`;
          const separator = entryUri.lastIndexOf("/");
          await fileSystem.makeDirectoryAsync(entryUri.slice(0, separator + 1), {
            intermediates: true,
          });
          await fileSystem.writeAsStringAsync(entryUri, bytesToBase64(entry.bytes), {
            encoding: fileSystem.EncodingType.Base64,
          });
        }
        const existing = await fileSystem.getInfoAsync(published);
        if (!existing.exists) {
          try {
            await fileSystem.moveAsync({ from: candidate, to: published });
            candidatePublished = true;
          } catch (error) {
            const wonByPeer = await fileSystem.getInfoAsync(published);
            if (!wonByPeer.exists) throw error;
          }
        }
      } finally {
        if (!candidatePublished) {
          await fileSystem.deleteAsync(candidate, { idempotent: true });
        }
      }
      await database.publishRelease({
        releaseId: input.descriptor.expectedReleaseId as `sha256:${string}`,
        artifactUri: `${published}release.pprelease`,
        manifestJson: JSON.stringify(input.manifest),
        installedAt: installedAt(),
      });
    },
  };
}
