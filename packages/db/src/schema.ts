export const AUTHORITATIVE_HUNT_MIGRATION = `
CREATE TABLE IF NOT EXISTS plotpoint_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp()
);
CREATE TABLE IF NOT EXISTS release_registrations (
  release_id TEXT PRIMARY KEY,
  manifest_json JSONB NOT NULL,
  mechanic_config_json JSONB NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp()
);
CREATE TABLE IF NOT EXISTS hunt_sessions (
  session_id TEXT PRIMARY KEY,
  creation_id TEXT NOT NULL UNIQUE,
  creation_digest TEXT NOT NULL,
  release_id TEXT NOT NULL REFERENCES release_registrations(release_id),
  team_id TEXT NOT NULL UNIQUE,
  team_label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp()
);
CREATE TABLE IF NOT EXISTS hunt_invitations (
  invitation_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES hunt_sessions(session_id),
  secret_digest TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_join_request_id TEXT,
  consumed_credential_digest TEXT
);
CREATE TABLE IF NOT EXISTS hunt_participants (
  participant_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES hunt_sessions(session_id),
  team_id TEXT NOT NULL,
  join_request_id TEXT NOT NULL,
  credential_digest TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  receipt_position BIGINT NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  revoked_at TIMESTAMPTZ,
  revocation_operation_id TEXT UNIQUE,
  UNIQUE (session_id, join_request_id)
);
CREATE TABLE IF NOT EXISTS team_aggregates (
  session_id TEXT NOT NULL REFERENCES hunt_sessions(session_id),
  team_id TEXT NOT NULL,
  schema_id TEXT NOT NULL,
  state_version INTEGER NOT NULL CHECK (state_version >= 0),
  state_json JSONB NOT NULL,
  PRIMARY KEY (session_id, team_id)
);
CREATE TABLE IF NOT EXISTS authoritative_command_receipts (
  session_id TEXT NOT NULL REFERENCES hunt_sessions(session_id),
  command_id TEXT NOT NULL,
  participant_id TEXT NOT NULL REFERENCES hunt_participants(participant_id),
  request_digest TEXT NOT NULL,
  request_json TEXT NOT NULL,
  terminal TEXT NOT NULL CHECK (terminal IN ('accepted', 'no-op', 'rejected', 'invalid')),
  outcome_code TEXT NOT NULL,
  resulting_state_version INTEGER NOT NULL CHECK (resulting_state_version >= 0),
  result_json TEXT NOT NULL,
  decision_position BIGINT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (session_id, participant_id, command_id),
  UNIQUE (session_id, participant_id, decision_position)
);
CREATE TABLE IF NOT EXISTS authoritative_command_journal (
  session_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  before_version INTEGER NOT NULL,
  after_version INTEGER NOT NULL,
  outcome_code TEXT NOT NULL,
  PRIMARY KEY (session_id, participant_id, command_id),
  FOREIGN KEY (session_id, participant_id, command_id) REFERENCES authoritative_command_receipts(session_id, participant_id, command_id)
);
CREATE TABLE IF NOT EXISTS authoritative_domain_events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_json JSONB NOT NULL,
  FOREIGN KEY (session_id, participant_id, command_id) REFERENCES authoritative_command_receipts(session_id, participant_id, command_id)
);
CREATE TABLE IF NOT EXISTS authoritative_operational_events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT,
  participant_id TEXT,
  command_id TEXT,
  code TEXT NOT NULL,
  state_version INTEGER,
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp()
);
`;
