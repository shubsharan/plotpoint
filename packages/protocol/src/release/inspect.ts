import { decodeCanonicalJson } from "./canonical-json.js";
import {
  parseGameComposition,
  validateGameCompositionInventory,
  type GameReleaseInspection,
} from "./game-composition.js";
import { openRelease } from "./open.js";
import { GAME_COMPOSITION_PATH } from "./paths.js";
import type { InspectedRelease, InvalidRelease, ReleaseDiagnostic } from "./types.js";

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

function compositionInvalid(
  code: "game-composition-missing" | "game-composition-invalid",
  reason: string,
  cause?: ReleaseDiagnostic,
): InvalidRelease {
  return {
    kind: "invalid",
    diagnostics: [
      Object.freeze({
        category: "composition",
        code,
        path: GAME_COMPOSITION_PATH,
        details: Object.freeze({
          reason,
          ...(cause === undefined ? {} : { cause: cause.details }),
        }),
      }),
    ],
  };
}

export async function inspectGameRelease(
  bytes: Uint8Array,
  partialLimits: Partial<ReleaseInspectionLimits> = {},
): Promise<GameReleaseInspection | InvalidRelease> {
  const opened = await openRelease(bytes, partialLimits);
  if (opened.kind === "invalid") return opened;
  const catalogEntry = opened.entries.find((entry) => entry.path === GAME_COMPOSITION_PATH);
  if (catalogEntry === undefined) {
    return compositionInvalid("game-composition-missing", "catalog-entry-missing");
  }
  if (catalogEntry.kind !== "content") {
    return compositionInvalid("game-composition-invalid", "catalog-entry-role-invalid");
  }
  const decoded = decodeCanonicalJson(catalogEntry.bytes);
  if (decoded.kind === "invalid") {
    return compositionInvalid(
      "game-composition-invalid",
      "catalog-encoding-invalid",
      decoded.diagnostic,
    );
  }
  const parsed = parseGameComposition(decoded.document.value);
  if (parsed.kind === "invalid") return parsed;
  const inventoryMismatch = validateGameCompositionInventory(
    parsed.gameComposition,
    opened.manifest,
  );
  if (inventoryMismatch !== null) return inventoryMismatch;
  return Object.freeze({
    release: Object.freeze({
      kind: "inspected",
      releaseId: opened.releaseId,
      manifest: opened.manifest,
    }),
    gameComposition: parsed.gameComposition,
  });
}
