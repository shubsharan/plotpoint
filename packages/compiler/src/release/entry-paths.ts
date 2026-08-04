export type GeneratedReleaseEntryRole =
  | "aggregate-schema"
  | "schema"
  | "progression"
  | "component"
  | "content";

const PREFIX_BY_ROLE: Readonly<Record<GeneratedReleaseEntryRole, string>> = Object.freeze({
  "aggregate-schema": "schemas/aggregate",
  schema: "schemas/general",
  progression: "progressions",
  component: "components",
  content: "content",
});

const encoder = new TextEncoder();

export function encodeReleaseEntryId(id: string): string {
  let encoded = "";
  for (const byte of encoder.encode(id)) encoded += byte.toString(16).padStart(2, "0");
  return encoded;
}

export function generatedReleaseEntryPath(role: GeneratedReleaseEntryRole, id: string): string {
  return `${PREFIX_BY_ROLE[role]}/${encodeReleaseEntryId(id)}.json`;
}
