#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import QRCode from "qrcode";

import {
  inspectRelease,
  isReleaseId,
  verifyRelease,
  type InspectedRelease,
  type InvalidRelease,
  type ReleaseId,
  type VerifiedRelease,
} from "@plotpoint/protocol";

import { compileProject, serveRelease, validateProject } from "./index.js";
import { renderCompilerDiagnostics } from "./diagnostics/render.js";

const USAGE = [
  "plotpoint validate --project <dir> [--config <file>] [--json]",
  "plotpoint compile --project <dir> --out <new.pprelease> [--config <file>] [--json]",
  "plotpoint inspect <release.pprelease> [--json]",
  "plotpoint verify <release.pprelease> [--expect sha256:<hex>] [--json]",
  "plotpoint serve <release.pprelease> [--host <private-ip>] [--port <port>]",
].join("\n");

interface ParsedProjectArguments {
  readonly command: "validate" | "compile";
  readonly project: string;
  readonly config?: string;
  readonly output?: string;
  readonly json: boolean;
}

interface ParsedInspectArguments {
  readonly command: "inspect";
  readonly release: string;
  readonly json: boolean;
}

interface ParsedVerifyArguments {
  readonly command: "verify";
  readonly release: string;
  readonly expectedReleaseId?: ReleaseId;
  readonly json: boolean;
}

interface ParsedServeArguments {
  readonly command: "serve";
  readonly release: string;
  readonly host?: string;
  readonly port?: number;
}

type ParsedArguments =
  | ParsedProjectArguments
  | ParsedInspectArguments
  | ParsedVerifyArguments
  | ParsedServeArguments;

function parseArguments(argv: readonly string[]): ParsedArguments | null {
  const [command, ...tokens] = argv;
  if (command === "serve") {
    const release = tokens[0];
    if (release === undefined || release.startsWith("--")) return null;
    let host: string | undefined;
    let port: number | undefined;
    for (let index = 1; index < tokens.length; index += 1) {
      const token = tokens[index];
      const value = tokens[index + 1];
      if (value === undefined || value.startsWith("--")) return null;
      if (token === "--host" && host === undefined) host = value;
      else if (token === "--port" && port === undefined && /^\d+$/.test(value)) {
        port = Number(value);
        if (port < 0 || port > 65_535) return null;
      } else return null;
      index += 1;
    }
    return Object.freeze({
      command,
      release,
      ...(host === undefined ? {} : { host }),
      ...(port === undefined ? {} : { port }),
    });
  }
  if (command === "inspect") {
    if (tokens.length === 1 && tokens[0] !== undefined && !tokens[0].startsWith("--")) {
      return Object.freeze({ command, release: tokens[0], json: false });
    }
    if (
      tokens.length === 2 &&
      tokens[0] !== undefined &&
      !tokens[0].startsWith("--") &&
      tokens[1] === "--json"
    ) {
      return Object.freeze({ command, release: tokens[0], json: true });
    }
    return null;
  }
  if (command === "verify") {
    const release = tokens[0];
    if (release === undefined || release.startsWith("--")) return null;
    let expectedReleaseId: ReleaseId | undefined;
    let json = false;
    for (let index = 1; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token === "--json") {
        if (json) return null;
        json = true;
        continue;
      }
      if (token !== "--expect" || expectedReleaseId !== undefined) return null;
      const value = tokens[index + 1];
      if (value === undefined || !isReleaseId(value)) return null;
      expectedReleaseId = value;
      index += 1;
    }
    return Object.freeze({
      command,
      release,
      ...(expectedReleaseId === undefined ? {} : { expectedReleaseId }),
      json,
    });
  }
  if (command !== "validate" && command !== "compile") return null;
  const values = new Map<string, string>();
  let json = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--json") {
      if (json) return null;
      json = true;
      continue;
    }
    if (token !== "--project" && token !== "--config" && token !== "--out") return null;
    if (values.has(token)) return null;
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith("--")) return null;
    values.set(token, value);
    index += 1;
  }
  const project = values.get("--project");
  const output = values.get("--out");
  if (
    project === undefined ||
    (command === "compile" ? output === undefined : output !== undefined)
  ) {
    return null;
  }
  return Object.freeze({
    command,
    project,
    ...(values.get("--config") === undefined ? {} : { config: values.get("--config") }),
    ...(output === undefined ? {} : { output }),
    json,
  });
}

function writeVerificationResult(result: VerifiedRelease | InvalidRelease, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (result.kind === "invalid") {
    for (const diagnostic of result.diagnostics) {
      const location = diagnostic.path ?? diagnostic.relationship ?? "release";
      process.stderr.write(
        `${location}: [${diagnostic.code}] ${JSON.stringify(diagnostic.details)}\n`,
      );
    }
    return;
  }
  const label =
    result.trust === "known-release-match"
      ? "known release identity matches"
      : "structurally valid; no expected identity supplied";
  process.stdout.write(`${result.releaseId} ${label}\n`);
}

function writeInspectionResult(result: InspectedRelease | InvalidRelease, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (result.kind === "invalid") {
    for (const diagnostic of result.diagnostics) {
      const location = diagnostic.path === undefined ? "release" : diagnostic.path;
      process.stderr.write(
        `${location}: [${diagnostic.code}] ${JSON.stringify(diagnostic.details)}\n`,
      );
    }
    return;
  }
  process.stdout.write(
    `${result.releaseId} format=${result.manifest.releaseFormatVersion} entries=${result.manifest.inventory.length}\n`,
  );
}

function writeResult(
  result: Awaited<ReturnType<typeof validateProject | typeof compileProject>>,
  json: boolean,
): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (result.kind === "invalid") {
    for (const diagnostic of renderCompilerDiagnostics(result.diagnostics)) {
      process.stderr.write(`${diagnostic}\n`);
    }
    return;
  }
  if (result.kind === "valid") {
    process.stdout.write("Project is valid.\n");
    return;
  }
  process.stdout.write(`${result.releaseId} ${result.outputFile}\n`);
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const parsed = parseArguments(argv);
  if (parsed === null) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  if (parsed.command === "inspect") {
    const result = await inspectRelease(new Uint8Array(await readFile(parsed.release)));
    writeInspectionResult(result, parsed.json);
    return result.kind === "invalid" ? 2 : 0;
  }
  if (parsed.command === "verify") {
    const result = await verifyRelease({
      bytes: new Uint8Array(await readFile(parsed.release)),
      ...(parsed.expectedReleaseId === undefined
        ? {}
        : { expectedReleaseId: parsed.expectedReleaseId }),
    });
    writeVerificationResult(result, parsed.json);
    return result.kind === "invalid" ? 2 : 0;
  }
  if (parsed.command === "serve") {
    const server = await serveRelease({
      releaseFile: parsed.release,
      ...(parsed.host === undefined ? {} : { host: parsed.host }),
      ...(parsed.port === undefined ? {} : { port: parsed.port }),
    });
    process.stdout.write(`${server.releaseId}\n${server.descriptorUrl}\n`);
    process.stdout.write(
      await QRCode.toString(server.descriptorUrl, { type: "terminal", small: true }),
    );
    await new Promise<void>((resolve) => {
      const stop = () => {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
        void server.close().finally(resolve);
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
    return 0;
  }
  const common = {
    projectRoot: parsed.project,
    ...(parsed.config === undefined ? {} : { configPath: parsed.config }),
  };
  const result =
    parsed.command === "validate"
      ? await validateProject(common)
      : await compileProject({ ...common, outputFile: parsed.output as string });
  writeResult(result, parsed.json);
  return result.kind === "invalid" ? 2 : 0;
}

const entryUrl = process.argv[1] === undefined ? undefined : pathToFileURL(process.argv[1]).href;
if (entryUrl === import.meta.url) {
  runCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Unknown compiler infrastructure failure";
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
