import { isReleaseId } from "./identity.js";
import { inspectRelease, type ReleaseInspectionLimits } from "./inspect.js";
import type {
  CanonicalJsonObject,
  InvalidRelease,
  VerifiedRelease,
  VerifyReleaseInput,
} from "./types.js";

function identityInvalid(
  code: string,
  relationship: string,
  details: CanonicalJsonObject,
): InvalidRelease {
  return {
    kind: "invalid",
    diagnostics: [
      Object.freeze({
        category: "identity",
        code,
        relationship,
        details: Object.freeze(details),
      }),
    ],
  };
}

export async function verifyRelease(
  input: VerifyReleaseInput,
  partialLimits: Partial<ReleaseInspectionLimits> = {},
): Promise<VerifiedRelease | InvalidRelease> {
  const expectedReleaseId: unknown = input.expectedReleaseId;
  if (expectedReleaseId !== undefined) {
    if (typeof expectedReleaseId !== "string" || !isReleaseId(expectedReleaseId)) {
      return identityInvalid("expected-release-id-invalid", "expected-release-id", {
        reason: "invalid-release-id",
      });
    }
  }

  const inspected = await inspectRelease(input.bytes, partialLimits);
  if (inspected.kind === "invalid") return inspected;

  if (expectedReleaseId === undefined) {
    return Object.freeze({
      kind: "verified",
      trust: "structurally-valid",
      releaseId: inspected.releaseId,
      manifest: inspected.manifest,
    });
  }

  if (inspected.releaseId !== expectedReleaseId) {
    return identityInvalid("release-id-mismatch", "expected-release-id", {
      actual: inspected.releaseId,
      expected: expectedReleaseId,
    });
  }

  return Object.freeze({
    kind: "verified",
    trust: "known-release-match",
    releaseId: inspected.releaseId,
    expectedReleaseId,
    manifest: inspected.manifest,
  });
}
