import { constants } from "node:fs";
import { link, open, readFile, unlink } from "node:fs/promises";

import { siblingTemporaryPath, validateReleaseOutputPath } from "../project/path-policy.js";

export interface AtomicPublicationResult {
  readonly status: "published" | "reused";
  readonly outputFile: string;
}

export class OutputCollisionError extends Error {
  readonly outputFile: string;

  constructor(outputFile: string) {
    super(`Release output already exists with different bytes: ${outputFile}`);
    this.name = "OutputCollisionError";
    this.outputFile = outputFile;
  }
}

export class TemporaryCleanupError extends Error {
  readonly temporaryFile: string;

  constructor(temporaryFile: string, options?: ErrorOptions) {
    super(`Could not remove temporary release file: ${temporaryFile}`, options);
    this.name = "TemporaryCleanupError";
    this.temporaryFile = temporaryFile;
  }
}

export class AtomicOutputInterruptionError extends Error {
  readonly point: "after-write" | "before-publish";

  constructor(point: "after-write" | "before-publish") {
    super(`Injected atomic output interruption: ${point}`);
    this.name = "AtomicOutputInterruptionError";
    this.point = point;
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}

async function removeTemporaryFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return;
    throw new TemporaryCleanupError(path, { cause: error });
  }
}

export async function publishReleaseAtomically(input: {
  readonly outputFile: string;
  readonly bytes: Uint8Array;
  readonly token: string;
  readonly failureInjection?: "after-write" | "before-publish";
}): Promise<AtomicPublicationResult> {
  const outputFile = validateReleaseOutputPath(input.outputFile);
  const temporaryFile = siblingTemporaryPath(outputFile, input.token);
  const handle = await open(
    temporaryFile,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  );

  try {
    await handle.writeFile(input.bytes);
    await handle.sync();
    if (input.failureInjection === "after-write") {
      throw new AtomicOutputInterruptionError("after-write");
    }
  } catch (error) {
    await handle.close();
    await removeTemporaryFile(temporaryFile);
    throw error;
  }
  await handle.close();

  if (input.failureInjection === "before-publish") {
    await removeTemporaryFile(temporaryFile);
    throw new AtomicOutputInterruptionError("before-publish");
  }

  try {
    await link(temporaryFile, outputFile);
  } catch (error) {
    if (!hasErrorCode(error, "EEXIST")) {
      await removeTemporaryFile(temporaryFile);
      throw error;
    }

    const existingBytes = await readFile(outputFile);
    await removeTemporaryFile(temporaryFile);
    if (!bytesEqual(existingBytes, input.bytes)) throw new OutputCollisionError(outputFile);
    return Object.freeze({ status: "reused", outputFile });
  }

  await removeTemporaryFile(temporaryFile);
  return Object.freeze({ status: "published", outputFile });
}
