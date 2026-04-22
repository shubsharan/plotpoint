export type StoryRunPersistenceErrorCode =
  | 'story_run_run_not_found'
  | 'story_run_missing_published_package'
  | 'story_run_role_slot_drift'
  | 'story_run_pending_invite_conflict'
  | 'story_run_active_binding_conflict'
  | 'story_run_incomplete_assignment_at_start'
  | 'story_run_resume_binding_not_found'
  | 'story_run_pinned_package_missing'
  | 'story_run_pinned_package_load_failed';

type StoryRunPersistenceErrorOptions = {
  cause?: unknown;
  details?: Record<string, unknown> | undefined;
};

export class StoryRunPersistenceError extends Error {
  readonly code: StoryRunPersistenceErrorCode;
  readonly details?: Record<string, unknown> | undefined;

  constructor(
    code: StoryRunPersistenceErrorCode,
    message: string,
    options?: StoryRunPersistenceErrorOptions,
  ) {
    super(message, {
      cause: options?.cause,
    });
    this.name = 'StoryRunPersistenceError';
    this.code = code;
    this.details = options?.details;
  }
}
