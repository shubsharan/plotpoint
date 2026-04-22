import type {
  RoleRunStateRecord,
  RunInviteRecord,
  RunParticipantBindingRecord,
  RunRoleSlotRecord,
  StoryRunRecord,
  StoryRunSharedStateRecord,
} from '../schema/story-runs.js';

export type {
  RoleRunStateRecord,
  RunInviteRecord,
  RunParticipantBindingRecord,
  RunRoleSlotRecord,
  StoryRunRecord,
  StoryRunSharedStateRecord,
};

export type RunResumeEnvelope = {
  binding: RunParticipantBindingRecord;
  roleState: RoleRunStateRecord;
  roleSlot: RunRoleSlotRecord;
  run: StoryRunRecord;
  sharedState: StoryRunSharedStateRecord;
};
