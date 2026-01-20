import type { SemVer, VersionConstraint } from '@plotpoint/types';

/**
 * Parse a version string into a SemVer object
 * @param version - Version string (e.g., "1.2.3")
 * @returns SemVer object or null if invalid
 */
export function parseSemVer(version: string): SemVer | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Convert a SemVer object to a string
 */
export function semVerToString(version: SemVer): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/**
 * Compare two SemVer versions
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareSemVer(a: SemVer, b: SemVer): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

/**
 * Check if version a is greater than version b
 */
export function isGreaterThan(a: SemVer, b: SemVer): boolean {
  return compareSemVer(a, b) === 1;
}

/**
 * Check if version a is less than version b
 */
export function isLessThan(a: SemVer, b: SemVer): boolean {
  return compareSemVer(a, b) === -1;
}

/**
 * Check if version a equals version b
 */
export function isEqual(a: SemVer, b: SemVer): boolean {
  return compareSemVer(a, b) === 0;
}

/**
 * Check if version a is greater than or equal to version b
 */
export function isGreaterThanOrEqual(a: SemVer, b: SemVer): boolean {
  return compareSemVer(a, b) >= 0;
}

/**
 * Check if version a is less than or equal to version b
 */
export function isLessThanOrEqual(a: SemVer, b: SemVer): boolean {
  return compareSemVer(a, b) <= 0;
}

/**
 * Parse a version constraint string
 * @param constraint - Constraint string (e.g., "^1.0.0", ">=2.0.0", "1.2.3")
 * @returns Object with operator and version, or null if invalid
 */
export function parseConstraint(constraint: VersionConstraint): {
  operator: '^' | '~' | '>=' | '<=' | '>' | '<' | '=';
  version: SemVer;
} | null {
  const match = constraint.match(/^(\^|~|>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/);
  if (!match) return null;

  const version = parseSemVer(match[2]);
  if (!version) return null;

  return {
    operator: (match[1] || '=') as '^' | '~' | '>=' | '<=' | '>' | '<' | '=',
    version,
  };
}

/**
 * Check if a version satisfies a constraint
 *
 * Constraint operators:
 * - `^1.0.0` - Compatible with version (same major, >= minor.patch)
 * - `~1.0.0` - Approximately equivalent (same major.minor, >= patch)
 * - `>=1.0.0` - Greater than or equal
 * - `<=1.0.0` - Less than or equal
 * - `>1.0.0` - Greater than
 * - `<1.0.0` - Less than
 * - `=1.0.0` or `1.0.0` - Exact match
 */
export function satisfies(version: SemVer, constraint: VersionConstraint): boolean {
  const parsed = parseConstraint(constraint);
  if (!parsed) return false;

  const { operator, version: constraintVersion } = parsed;

  switch (operator) {
    case '^':
      // Caret: allows changes that do not modify the left-most non-zero digit
      // ^1.2.3 := >=1.2.3 <2.0.0
      // ^0.2.3 := >=0.2.3 <0.3.0
      // ^0.0.3 := >=0.0.3 <0.0.4
      if (constraintVersion.major === 0) {
        if (constraintVersion.minor === 0) {
          // ^0.0.x - only exact patch
          return (
            version.major === 0 &&
            version.minor === 0 &&
            version.patch === constraintVersion.patch
          );
        }
        // ^0.x.y - same major and minor, patch >= constraint
        return (
          version.major === 0 &&
          version.minor === constraintVersion.minor &&
          version.patch >= constraintVersion.patch
        );
      }
      // ^x.y.z (x > 0) - same major, minor.patch >= constraint
      return (
        version.major === constraintVersion.major &&
        (version.minor > constraintVersion.minor ||
          (version.minor === constraintVersion.minor &&
            version.patch >= constraintVersion.patch))
      );

    case '~':
      // Tilde: allows patch-level changes
      // ~1.2.3 := >=1.2.3 <1.3.0
      return (
        version.major === constraintVersion.major &&
        version.minor === constraintVersion.minor &&
        version.patch >= constraintVersion.patch
      );

    case '>=':
      return isGreaterThanOrEqual(version, constraintVersion);

    case '<=':
      return isLessThanOrEqual(version, constraintVersion);

    case '>':
      return isGreaterThan(version, constraintVersion);

    case '<':
      return isLessThan(version, constraintVersion);

    case '=':
    default:
      return isEqual(version, constraintVersion);
  }
}

/**
 * Find the highest version from a list that satisfies a constraint
 * @param versions - Array of SemVer versions
 * @param constraint - Version constraint
 * @returns The highest satisfying version, or null if none satisfy
 */
export function findHighestSatisfying(
  versions: SemVer[],
  constraint: VersionConstraint
): SemVer | null {
  const satisfyingVersions = versions.filter((v) => satisfies(v, constraint));

  if (satisfyingVersions.length === 0) return null;

  return satisfyingVersions.reduce((highest, current) =>
    isGreaterThan(current, highest) ? current : highest
  );
}

/**
 * Sort versions in descending order (highest first)
 */
export function sortVersionsDescending(versions: SemVer[]): SemVer[] {
  return [...versions].sort((a, b) => compareSemVer(b, a));
}

/**
 * Sort versions in ascending order (lowest first)
 */
export function sortVersionsAscending(versions: SemVer[]): SemVer[] {
  return [...versions].sort(compareSemVer);
}

/**
 * Increment a version by type
 */
export function incrementVersion(
  version: SemVer,
  type: 'major' | 'minor' | 'patch'
): SemVer {
  switch (type) {
    case 'major':
      return { major: version.major + 1, minor: 0, patch: 0 };
    case 'minor':
      return { major: version.major, minor: version.minor + 1, patch: 0 };
    case 'patch':
      return { major: version.major, minor: version.minor, patch: version.patch + 1 };
  }
}

/**
 * Check if a version is valid
 */
export function isValidVersion(version: string): boolean {
  return parseSemVer(version) !== null;
}

/**
 * Check if a constraint is valid
 */
export function isValidConstraint(constraint: string): boolean {
  return parseConstraint(constraint) !== null;
}
