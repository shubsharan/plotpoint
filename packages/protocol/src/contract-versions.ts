/**
 * Serialized compatibility generations live here instead of in public symbol,
 * schema, command, or filename suffixes.
 */
export const CONTRACT_VERSIONS = Object.freeze({
  projectConfiguration: 1,
  releaseFormat: 1,
  hostApi: Object.freeze({ major: 1, minor: 1 }),
  installDescriptor: 1,
  hostBridge: 1,
  capabilityObservation: 1,
  playReport: 1,
  sharedSync: 1,
  sharedReport: 1,
  sharedApi: 1,
  gameComposition: 1,
} as const);

export type ContractName = keyof typeof CONTRACT_VERSIONS;
export type ContractVersion<Name extends ContractName> = (typeof CONTRACT_VERSIONS)[Name];
