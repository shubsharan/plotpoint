import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { isIPv4 } from "node:net";
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

export interface NetworkInterfaceAddress {
  readonly address: string;
  readonly family: string;
  readonly internal: boolean;
}

export function privateIpv4Addresses(
  interfaces: Readonly<
    Record<string, readonly NetworkInterfaceAddress[] | undefined>
  > = networkInterfaces(),
): readonly string[] {
  const addresses = new Set<string>();
  for (const entries of Object.values(interfaces)) {
    for (const address of entries ?? []) {
      if (address.family !== "IPv4" || address.internal) continue;
      if (isEligibleInstallUrl(`http://${address.address}/`)) addresses.add(address.address);
    }
  }
  return Object.freeze([...addresses].sort());
}

function chooseHost(explicit: string | undefined): string {
  if (explicit !== undefined) {
    if (!isIPv4(explicit) || !isEligibleInstallUrl(`http://${explicit}/`)) {
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
  if (input.releaseFile.length === 0) throw new Error("Release file path must not be empty");
  if (
    input.port !== undefined &&
    (!Number.isSafeInteger(input.port) || input.port < 0 || input.port > 65_535)
  ) {
    throw new Error(`Release server port must be an integer from 0 through 65535: ${input.port}`);
  }

  const bytes = Uint8Array.from(await readFile(input.releaseFile));
  if (bytes.byteLength > MAX_RELEASE_BYTES) {
    throw new Error(`Release exceeds ${MAX_RELEASE_BYTES} byte installation limit`);
  }
  const verified = await verifyRelease({ bytes });
  if (verified.kind === "invalid") {
    throw new Error(`Cannot serve invalid release: ${verified.diagnostics[0]?.code ?? "unknown"}`);
  }

  const host = chooseHost(input.host);
  let descriptorBody: string | undefined;
  const server = createServer((request, response) => {
    if (request.method !== "GET") {
      response.writeHead(405, { Allow: "GET", "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method not allowed\n");
      return;
    }
    if (request.url === "/install.json" && descriptorBody !== undefined) {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": Buffer.byteLength(descriptorBody),
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(descriptorBody);
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
  const descriptor: InstallDescriptorV1 = Object.freeze({
    version: 1,
    releaseUrl,
    expectedReleaseId: verified.releaseId,
  });
  descriptorBody = JSON.stringify(descriptor);
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
