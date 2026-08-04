import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const examplesRoot = new URL("../../../../examples/releases/", import.meta.url);

export interface ExternalProject {
  readonly root: string;
  readonly sandbox: string;
  cleanup(): Promise<void>;
}

export async function createExternalProject(fixture: string): Promise<ExternalProject> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(fixture)) {
    throw new TypeError("External project fixture name must be canonical");
  }
  const sandbox = await mkdtemp(join(tmpdir(), `plotpoint-${fixture}-`));
  const root = join(sandbox, "project");
  await cp(new URL(`${fixture}/`, examplesRoot), root, { recursive: true });
  return Object.freeze({
    root,
    sandbox,
    cleanup: () => rm(sandbox, { force: true, recursive: true }),
  });
}

export function resolveBuiltPackageRoot(specifier: "@plotpoint/compiler" | "@plotpoint/protocol") {
  const path = fileURLToPath(import.meta.resolve(specifier));
  if (!path.includes(`${sep}dist${sep}`)) {
    throw new Error(`${specifier} did not resolve through its built package root`);
  }
  return path;
}
