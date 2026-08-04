import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";

export const PROJECT_PATH_POLICY_REASONS = [
  "empty",
  "absolute",
  "backslash",
  "control-character",
  "empty-segment",
  "dot-segment",
  "url-syntax",
  "outside-root",
  "symlink",
  "case-alias",
  "not-file",
  "invalid-release-path",
  "invalid-release-extension",
] as const;

export type ProjectPathPolicyReason = (typeof PROJECT_PATH_POLICY_REASONS)[number];

export class ProjectPathPolicyError extends Error {
  readonly reason: ProjectPathPolicyReason;
  readonly path: string;

  constructor(reason: ProjectPathPolicyReason, path: string) {
    super(`Path policy violation (${reason}): ${path}`);
    this.name = "ProjectPathPolicyError";
    this.reason = reason;
    this.path = path;
  }
}

export interface ResolvedProjectRoot {
  readonly path: string;
  readonly realPath: string;
}

export interface ResolvedProjectFile {
  readonly projectPath: string;
  readonly absolutePath: string;
  readonly realPath: string;
}

function fail(reason: ProjectPathPolicyReason, path: string): never {
  throw new ProjectPathPolicyError(reason, path);
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function validateProjectPath(projectPath: string): string {
  if (projectPath.length === 0) fail("empty", projectPath);
  if (isAbsolute(projectPath) || /^[a-zA-Z]:/.test(projectPath)) {
    fail("absolute", projectPath);
  }
  if (projectPath.includes("\\")) fail("backslash", projectPath);
  if (hasControlCharacter(projectPath)) fail("control-character", projectPath);
  if (projectPath.includes(":") || projectPath.startsWith("//")) fail("url-syntax", projectPath);

  const segments = projectPath.split("/");
  if (segments.some((segment) => segment.length === 0)) fail("empty-segment", projectPath);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    fail("dot-segment", projectPath);
  }
  return projectPath;
}

export function validateReleaseDestinationPath(releasePath: string): string {
  if (!/^[a-z0-9._/-]+$/.test(releasePath)) {
    fail("invalid-release-path", releasePath);
  }
  validateProjectPath(releasePath);
  if (releasePath.includes("%")) fail("invalid-release-path", releasePath);
  return releasePath;
}

export function validateReleaseOutputPath(outputFile: string): string {
  if (outputFile.length === 0 || hasControlCharacter(outputFile)) fail("empty", outputFile);
  if (extname(outputFile) !== ".pprelease" || basename(outputFile) === ".pprelease") {
    fail("invalid-release-extension", outputFile);
  }
  return resolve(outputFile);
}

export function isPathContained(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot))
  );
}

async function assertCanonicalCase(
  parent: string,
  segment: string,
  projectPath: string,
): Promise<void> {
  const entries = await readdir(parent);
  if (entries.includes(segment)) return;
  const folded = segment.toLowerCase();
  if (entries.some((entry: string) => entry.toLowerCase() === folded)) {
    fail("case-alias", projectPath);
  }
}

export async function resolveProjectRoot(projectRoot: string): Promise<ResolvedProjectRoot> {
  const path = resolve(projectRoot);
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink()) fail("symlink", projectRoot);
  if (!metadata.isDirectory()) fail("not-file", projectRoot);
  const realPath = await realpath(path);
  return Object.freeze({ path, realPath });
}

export async function resolveProjectFile(
  root: ResolvedProjectRoot,
  projectPath: string,
): Promise<ResolvedProjectFile> {
  validateProjectPath(projectPath);
  const absolutePath = resolve(root.path, ...projectPath.split("/"));
  if (!isPathContained(root.path, absolutePath)) fail("outside-root", projectPath);

  let parent = root.path;
  for (const segment of projectPath.split("/")) {
    await assertCanonicalCase(parent, segment, projectPath);
    const current = resolve(parent, segment);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) fail("symlink", projectPath);
    parent = current;
  }

  const metadata = await lstat(absolutePath);
  if (!metadata.isFile()) fail("not-file", projectPath);
  const resolvedRealPath = await realpath(absolutePath);
  if (!isPathContained(root.realPath, resolvedRealPath)) fail("outside-root", projectPath);

  return Object.freeze({ projectPath, absolutePath, realPath: resolvedRealPath });
}

export function findCaseEquivalentPaths(paths: readonly string[]): readonly (readonly string[])[] {
  const groups = new Map<string, string[]>();
  for (const path of paths) {
    const key = path.toLowerCase();
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [path]);
    else group.push(path);
  }
  return Object.freeze(
    [...groups.values()]
      .filter((group) => new Set(group).size > 1)
      .map((group) => Object.freeze([...group].sort())),
  );
}

export function siblingTemporaryPath(outputFile: string, token: string): string {
  const finalPath = validateReleaseOutputPath(outputFile);
  if (!/^[a-z0-9-]+$/.test(token)) fail("invalid-release-path", token);
  return resolve(dirname(finalPath), `.${basename(finalPath)}.${token}.tmp`);
}
