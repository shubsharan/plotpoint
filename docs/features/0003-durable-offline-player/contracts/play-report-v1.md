# Contract: Play Report V1

`PlayReportV1` contains format version, release identity, run identity, platform, relative start/end
times, ordered command outcomes and resulting versions, progression changes, location permission and
accuracy bands, interruption/recovery events, and diagnostic codes.

The export contract never contains absolute coordinates, credentials, command payloads, raw aggregate
state, protected content, host paths, or stack traces. Report creation fails explicitly if required
durable records cannot be validated; it never emits a success-shaped partial report.
