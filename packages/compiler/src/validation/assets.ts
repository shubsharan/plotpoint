import { createCompilerDiagnostic } from "../diagnostics/create.js";
import { orderCompilerDiagnostics } from "../diagnostics/order.js";
import type { CompilationSnapshot, CompilerDiagnostic } from "../project/config.js";

export interface ValidatedAsset {
  readonly id: string;
  readonly path: string;
  readonly releasePath: string;
  readonly bytes: Uint8Array;
}

export type ValidateAssetsResult =
  | { readonly kind: "valid"; readonly assets: readonly ValidatedAsset[] }
  | { readonly kind: "invalid"; readonly diagnostics: readonly CompilerDiagnostic[] };

export function validateAssets(snapshot: CompilationSnapshot): ValidateAssetsResult {
  const assets: ValidatedAsset[] = [];
  const diagnostics: CompilerDiagnostic[] = [];
  const destinations = new Map<string, string>();
  const reservedDestinations = new Set(
    [
      "bundles/logic.js",
      "bundles/presentation.js",
      "manifest.json",
      ...snapshot.registries.aggregateSchemas.map(({ id }) => `schemas/aggregate/${id}.json`),
      ...snapshot.registries.schemas.map(({ id }) => `schemas/general/${id}.json`),
      ...snapshot.registries.progressions.map(({ id }) => `progressions/${id}.json`),
      ...snapshot.registries.components.map(({ id }) => `components/${id}.json`),
      ...snapshot.registries.content.map(({ id }) => `content/${id}.json`),
    ].map((path) => path.toLowerCase()),
  );
  for (const registration of snapshot.registries.assets) {
    const destinationKey = registration.releasePath.toLowerCase();
    const previous = destinations.get(destinationKey);
    if (previous !== undefined || reservedDestinations.has(destinationKey)) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "asset-destination-duplicate",
          location: {
            kind: "registration",
            registration: "assets",
            id: registration.id,
            field: "releasePath",
          },
          details: {
            destination: registration.releasePath,
            conflict: previous ?? "reserved-release-entry",
          },
        }),
      );
    } else {
      destinations.set(destinationKey, registration.id);
    }
    const file = snapshot.files.get(registration.path);
    if (file === undefined) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "asset-unreadable",
          location: { kind: "registration", registration: "assets", id: registration.id },
          details: { path: registration.path },
        }),
      );
      continue;
    }
    if (file.bytes.byteLength === 0) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "asset-empty",
          location: { kind: "artifact", path: registration.path },
          details: { id: registration.id },
        }),
      );
      continue;
    }
    assets.push(
      Object.freeze({
        id: registration.id,
        path: registration.path,
        releasePath: registration.releasePath,
        bytes: new Uint8Array(file.bytes),
      }),
    );
  }
  if (diagnostics.length > 0) {
    return { kind: "invalid", diagnostics: orderCompilerDiagnostics(diagnostics) };
  }
  return { kind: "valid", assets: Object.freeze(assets) };
}
