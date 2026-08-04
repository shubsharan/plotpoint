# Data Model: Durable Offline Field Puzzle

## Install Descriptor

Version 1 document with one absolute private-network release URL and one expected release identity.
It is transport metadata and never enters release bytes.

## Installed Release

Keyed by release identity. Stores canonical manifest metadata, private installation root, installation
time, and publication state. A candidate becomes installed only after full download, verification,
compatibility assessment, and atomic file publication.

## Game Run

Fresh identity pinned to one installed release with created time and lifecycle status. A different
release identity always creates a different run; there is no migration relationship in Loop 1.

## Aggregate Snapshot

One local player aggregate per run with aggregate identity, schema identity/version, state version,
canonical state, and latest journal position.

## Command Receipt And Journal Entry

The receipt is keyed by run and stable command identity and records target, expected version, terminal
result, and resulting version. An accepted receipt, next snapshot, semantic outcome, journal entry,
and consumed-observation links commit atomically. A duplicate returns the existing receipt.

## Location Observation

Host-generated identity, run, captured time, latitude, longitude, horizontal accuracy, and terminal
availability/permission state. Successful observations commit before delivery to game logic. Reports
project only permission state, recency, and accuracy band.

## Recovery Event And Play Report

Recovery events record lifecycle phase, release/run correlation, command correlation when applicable,
diagnostic code, and disposition. `PlayReportV1` orders redacted command, progression, observation,
interruption, recovery, and diagnostic entries by relative time and contains no raw gameplay values.
