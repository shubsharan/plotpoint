import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const examplesRoot = new URL("../../../../examples/releases/", import.meta.url);

export const releaseExampleProjects = [
  "field-puzzle",
  "minimal-local-puzzle",
  "branching-media-tour",
  "co-op-game",
] as const;

export type ReleaseExampleProject = (typeof releaseExampleProjects)[number];

export interface ExternalProject {
  readonly root: string;
  readonly sandbox: string;
  cleanup(): Promise<void>;
}

export function releaseExampleRoot(fixture: ReleaseExampleProject): URL {
  return new URL(`${fixture}/`, examplesRoot);
}

export async function createExternalProject(
  fixture: ReleaseExampleProject,
): Promise<ExternalProject> {
  const sandbox = await mkdtemp(join(tmpdir(), `plotpoint-${fixture}-`));
  const root = join(sandbox, "project");
  await cp(releaseExampleRoot(fixture), root, { recursive: true });
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
