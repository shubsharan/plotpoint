export type EngineRuntimeErrorCode =
  | 'runtime_block_not_found'
  | 'runtime_node_not_found'
  | 'runtime_role_not_found'
  | 'runtime_snapshot_invalid'
  | 'runtime_story_package_invalid'
  | 'runtime_story_package_unavailable'
  | 'runtime_story_package_version_unavailable'
  | 'runtime_story_id_mismatch';

export class EngineRuntimeError extends Error {
  readonly code: EngineRuntimeErrorCode;

  constructor(code: EngineRuntimeErrorCode, message: string) {
    super(message);
    this.name = 'EngineRuntimeError';
    this.code = code;
  }
}
