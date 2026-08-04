import { openRelease } from "./open.js";
import type { InspectedRelease, InvalidRelease } from "./types.js";

export { DEFAULT_RELEASE_INSPECTION_LIMITS, type ReleaseInspectionLimits } from "./open.js";
import type { ReleaseInspectionLimits } from "./open.js";

export async function inspectRelease(
  bytes: Uint8Array,
  partialLimits: Partial<ReleaseInspectionLimits> = {},
): Promise<InspectedRelease | InvalidRelease> {
  const opened = await openRelease(bytes, partialLimits);
  if (opened.kind === "invalid") return opened;
  return Object.freeze({
    kind: "inspected",
    releaseId: opened.releaseId,
    manifest: opened.manifest,
  });
}
