| Field           | Value               |
| --------------- | ------------------- |
| **Type**        | ADR                 |
| **Status**      | Accepted            |
| **Owner**       | product-engineering |
| **Last synced** | 2026-03-24          |

# ADR-0001 - Story Package Object Storage Links

## Context

Story packages can become large and mutable over time. Storing full story package JSON blobs directly in the `stories` row couples metadata CRUD to content payload size and makes publish artifact evolution harder.

## Decision

Draft and published story records store object-storage pointers, not full story package JSON payloads, in relational tables.

- `stories` stores a draft story package pointer (`draft_package_uri`) plus metadata.
- Publish flow stores published package version pointers as separate immutable artifacts (defined in FEAT-0005).
- API/publish layers own upload/download orchestration to object storage (S3-compatible), validation, and pointer lifecycle.
- Engine consumes story package JSON through repository ports; it does not own storage transport.

## Consequences

- DB CRUD becomes metadata-first and avoids large JSON writes in core story tables.
- Object storage becomes a required dependency for draft/publish workflows.
- Runtime and publish can evolve artifact versioning independently from story metadata schema.
- Backfill is required for any legacy rows that still store inline JSON payloads.
