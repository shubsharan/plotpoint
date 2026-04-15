export type EngineRuntimeErrorCode =
  | 'runtime_condition_evaluation_failed'
  | 'runtime_edge_not_traversable'
  | 'runtime_edge_not_found'
  | 'runtime_block_action_invalid'
  | 'runtime_block_already_unlocked'
  | 'runtime_block_config_invalid'
  | 'runtime_block_execution_failed'
  | 'runtime_block_location_read_failed'
  | 'runtime_block_not_found'
  | 'runtime_block_not_actionable'
  | 'runtime_block_state_invalid'
  | 'runtime_block_type_unregistered'
  | 'runtime_block_unsupported_location_target'
  | 'runtime_node_not_found'
  | 'runtime_role_not_found'
  | 'runtime_session_input_invalid'
  | 'runtime_story_package_invalid'
  | 'runtime_story_package_unavailable'
  | 'runtime_story_package_version_unavailable'
  | 'runtime_story_id_mismatch';

export type EngineRuntimeErrorDetails = Record<string, unknown>;

type EngineRuntimeErrorOptions = {
  cause?: unknown;
  details?: EngineRuntimeErrorDetails | undefined;
};

export class EngineRuntimeError extends Error {
  readonly code: EngineRuntimeErrorCode;
  readonly details?: EngineRuntimeErrorDetails | undefined;

  constructor(code: EngineRuntimeErrorCode, message: string, options?: EngineRuntimeErrorOptions) {
    super(message, {
      cause: options?.cause,
    });
    this.name = 'EngineRuntimeError';
    this.code = code;
    this.details = options?.details;
  }
}
