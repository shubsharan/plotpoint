import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { networkInterfaces } from "node:os";

import {
  MAX_RELEASE_BYTES,
  isEligibleInstallUrl,
  verifyRelease,
  type InstallDescriptorV1,
  type ReleaseId,
} from "@plotpoint/protocol";

export interface ServeReleaseInput {
  readonly releaseFile: string;
  readonly host?: string;
  readonly port?: number;
}

export interface RunningReleaseServer {
  readonly host: string;
  readonly port: number;
  readonly descriptorUrl: string;
  readonly releaseId: ReleaseId;
  close(): Promise<void>;
}

export function privateIpv4Addresses(): readonly string[] {
  const addresses = new Set<string>();
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const address of interfaces ?? []) {
      if (address.family !== "IPv4" || address.internal) continue;
      if (isEligibleInstallUrl(`http://${address.address}/`)) addresses.add(address.address);
    }
  }
  return Object.freeze([...addresses].sort());
}

function chooseHost(explicit: string | undefined): string {
  if (explicit !== undefined) {
    if (!isEligibleInstallUrl(`http://${explicit}/`)) {
      throw new Error(`Install host must be a private IPv4 address: ${explicit}`);
    }
    return explicit;
  }
  const candidates = privateIpv4Addresses();
  if (candidates.length !== 1) {
    const detail = candidates.length === 0 ? "none found" : candidates.join(", ");
    throw new Error(`Cannot select one private IPv4 address (${detail}); pass --host explicitly`);
  }
  return candidates[0] as string;
}

function listen(server: Server, host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Release server did not receive a TCP address"));
        return;
      }
      resolve(address.port);
    });
  });
}

export async function serveRelease(input: ServeReleaseInput): Promise<RunningReleaseServer> {
  const bytes = new Uint8Array(await readFile(input.releaseFile));
  if (bytes.byteLength > MAX_RELEASE_BYTES) {
    throw new Error(`Release exceeds ${MAX_RELEASE_BYTES} byte installation limit`);
  }
  const verified = await verifyRelease({ bytes });
  if (verified.kind === "invalid") {
    throw new Error(`Cannot serve invalid release: ${verified.diagnostics[0]?.code ?? "unknown"}`);
  }

  const host = chooseHost(input.host);
  let descriptor: InstallDescriptorV1 | undefined;
  const server = createServer((request, response) => {
    if (request.method !== "GET") {
      response.writeHead(405, { Allow: "GET", "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method not allowed\n");
      return;
    }
    if (request.url === "/install.json" && descriptor !== undefined) {
      const body = JSON.stringify(descriptor);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": Buffer.byteLength(body),
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(body);
      return;
    }
    if (request.url === "/release.pprelease") {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": bytes.byteLength,
        "Content-Type": "application/vnd.plotpoint.release",
      });
      response.end(bytes);
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
  });
  const port = await listen(server, host, input.port ?? 0);
  const releaseUrl = `http://${host}:${port}/release.pprelease`;
  descriptor = Object.freeze({
    version: 1,
    releaseUrl,
    expectedReleaseId: verified.releaseId,
  });
  return Object.freeze({
    host,
    port,
    descriptorUrl: `http://${host}:${port}/install.json`,
    releaseId: verified.releaseId,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  });
}
