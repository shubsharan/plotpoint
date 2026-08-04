const ARCHIVE_PATH_PATTERN = /^[a-z0-9._/-]+$/;

export type ArchivePathResult =
  | { readonly kind: "valid"; readonly path: string }
  | { readonly kind: "invalid"; readonly reason: string };

export function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function validateArchivePath(path: string): ArchivePathResult {
  if (typeof path !== "string" || path.length === 0) {
    return { kind: "invalid", reason: "empty-path" };
  }
  if (!ARCHIVE_PATH_PATTERN.test(path)) {
    return { kind: "invalid", reason: "invalid-character" };
  }
  if (path.startsWith("/") || path.endsWith("/")) {
    return { kind: "invalid", reason: "absolute-or-directory-path" };
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    return { kind: "invalid", reason: "empty-segment" };
  }
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return { kind: "invalid", reason: "dot-segment" };
  }
  return { kind: "valid", path };
}

export function isCanonicalArchivePath(path: string): boolean {
  return validateArchivePath(path).kind === "valid";
}
