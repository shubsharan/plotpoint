| Field           | Value      |
| --------------- | ---------- |
| **Type**        | Runbook    |
| **Status**      | Active     |
| **Last synced** | 2026-04-01 |

# Deferred Follow-ups Registry

## Purpose

Track deferred feature/epic TODOs in one place so they remain visible across reviews, status transitions, and feature closeout.

## Entry Format

- Use this exact shape for each item:
- `[DF-XXXX] <summary> | Owner: FEAT/EPIC-XXXX | Trigger: <when to pick up> | Exit criteria: <definition of done> | Sources: [doc](path)`
- Keep one stable `DF-XXXX` id per deferred item and reuse it in every source feature/epic doc that references the same follow-up.

## Current Deferred Follow-ups

- [DF-0001] Session upgrade policy for pinned published package versions. | Owner: EPIC-0003 | Trigger: Session orchestration implementation begins for persisted runtime resume and upgrade controls. | Exit criteria: Runtime/session docs and implementation ship an explicit upgrade action with reject-on-incompatibility behavior and pinned-version preservation. | Sources: [features/FEAT-0006-runtime-state-model-and-engine-public-surface.md](../features/FEAT-0006-runtime-state-model-and-engine-public-surface.md), [epics/EPIC-0003-headless-runtime-engine-and-condition-system.md](../epics/EPIC-0003-headless-runtime-engine-and-condition-system.md)
- [DF-0002] Conditioned-edge derivation and `traverseEdge` validation against persisted block unlock state remain deferred to FEAT-0008. FEAT-0007 intentionally exposes only unconditional edges in `traversableEdges` and rejects conditioned-edge traversal with a typed runtime error. | Owner: FEAT-0008 | Trigger: FEAT-0008 implementation begins for real traversal semantics. | Exit criteria: Engine derives `traversableEdges` from persisted runtime state and validates `traverseEdge` against that derived set. | Sources: [features/FEAT-0007-block-registry-and-action-executor.md](../features/FEAT-0007-block-registry-and-action-executor.md), [features/FEAT-0008-condition-registry-and-graph-traversal-semantics.md](../features/FEAT-0008-condition-registry-and-graph-traversal-semantics.md)
