# PlotPoint Product Roadmap

## Context

PlotPoint is a platform for narrative-first, location-based experiences. Players run stories inside a single mobile app. Creators publish to the platform.

The project was intentionally wiped to rebuild with clean architecture. Only `docs/OVERVIEW.md` remains.

## First Story Target

- **Genre:** Co-op murder mystery across San Francisco
- **Multiplayer:** Invite-code sessions, role-based storylines (roles TBD during story authoring)
- **Player count:** Flexible — system supports N roles
- **Authoring:** JSON by the team, no studio tool needed
- **Timeline:** No deadline, focus on clean architecture

## Technical Decisions

- **Backend:** Supabase for auth, Postgres, and Realtime (multiplayer sync). Hono API for server-side compute (Twilio webhooks, publishing, analytics ingestion). No Supabase Edge Functions.
- **Mobile:** Expo
- **Deployment:** Hono API is deployment-agnostic (host TBD)
- **Ads:** Location nodes include a `category` field for future ad support. No ad service in v1.
- **Auth model:** Story discovery is public. Auth required only for starting stories, joining sessions, and profile access.

## Cross-Cutting Concerns

### Error Handling & Graceful Degradation

Players will be physically moving through a city during gameplay. Error recovery is not optional.

- **Engine error boundaries** — the StoryExecutor catches evaluation errors (bad conditions, missing nodes) and surfaces them as engine-level error states rather than crashing. The player sees a recoverable error screen, not a white screen.
- **State recovery** — SessionState supports snapshotting. If state becomes corrupt, the engine can roll back to the last known-good snapshot.
- **Component error isolation** — a failing component does not take down the entire node. The ComponentRenderer wraps each component's render in an error boundary. Failed components show a fallback UI.
- **Sync failure handling** — SharedStateSync retries with exponential backoff. If sync fails persistently, the player is notified and progression is paused rather than silently diverging from other players.

### Versioning Strategy

- Story manifests include an `engineVersion` field from day one.
- Components declare `compatibleEngineVersions` in their manifest.
- No migration adapters in v1 (nothing to migrate from), but the `MigrationAdapter` interface is defined so the extension point is clear for future engine versions.

## Roadmap Phases

### Phase 1: Monorepo Scaffold + Core Types

**Goal:** Clean project structure with build tooling, shared types, and validation schemas.

**Structure:**
```
apps/
  mobile/          # Expo app (empty shell)
  api/             # Hono API (empty shell)
packages/
  engine/          # Story graph engine (Phase 2)
  components/      # Component system (Phase 3)
  types/           # Shared TypeScript types
  schemas/         # Zod validation schemas
  db/              # Drizzle ORM + Postgres schema
docs/
  OVERVIEW.md
```

**Deliverables:**
- pnpm workspaces + Turborepo config
- Shared TypeScript config
- Vitest setup
- Zod schemas for the core domain: `Story`, `Node`, `Edge`, `Condition`, `Role`, `ComponentManifest`, `PlayerState`, `SharedGameState`
- TypeScript types inferred from schemas
- Drizzle schema for Supabase Postgres — skeleton tables for stories, nodes, edges, users, sessions, roles. Phase 4 extends the session-related tables with additional columns and joins.
- Location nodes include a `category` field (ad-ready)
- **Story JSON format definition** — the canonical authoring format is defined here alongside the schemas so that all test stories from Phase 2 onward are validated against the real format

**Not included:** Any runtime logic, UI, or business logic.

---

### Phase 2: Story Engine

**Goal:** A pure TypeScript engine that loads story graphs, evaluates conditions, resolves edges, traverses nodes, and manages session state. Zero framework dependencies. Fully headless-testable.

**Package:** `packages/engine/`

**Modules:**
- **StoryGraph** — directed graph from nodes and edges. Traversal methods, graph integrity validation (no orphans, no unintentional dead ends)
- **EdgeResolver** — evaluates all outgoing edges' condition trees, returns first match (priority-ordered). Supports AND/OR composition
- **ConditionEvaluator** — evaluates condition types: `equals`, `greater_than`, `matches_pattern`, `player_has_role`, `node_visited`, `shared_state_check`. Extensible
- **SessionState** — per-player state (current node, visited nodes, local variables) and shared game state (cross-player variables). Clear separation. Supports snapshotting for state recovery
- **StoryExecutor** — orchestrates: current node -> player action -> evaluate edges -> transition -> next node. Emits events at each step. Catches evaluation errors and surfaces engine-level error states
- **EventEmitter** — lightweight pub/sub for engine events (node_entered, edge_traversed, action_performed, state_changed)
- **StoryValidator** — validates story JSON: schema validation (Zod), graph integrity (no orphans, valid edge references, reachable paths per role), condition tree validity. Moved here from Phase 8 so all test stories are validated from day one
- **MigrationAdapter interface** — defines the contract for future version adapters. No concrete adapters yet. Engine declares `engineVersion` on story manifests

**Testing:** Graph builder utilities for declarative story construction. Story simulator for headless storyline playthrough with state assertions. All test stories pass through StoryValidator.

**Key constraint:** No dependency on React, React Native, Expo, or any UI framework.

---

### Phase 3: Component System

**Goal:** Registry-based system where components are registered by name, have internal state machines, and communicate through a predefined action vocabulary. Logic decoupled from rendering.

**Package:** `packages/components/`

**Modules:**
- **ComponentRegistry** — registers component types by name + version. Resolves from manifests. Validates all required components are registered at startup
- **ComponentStateMachine** — each component type defines states and valid transitions. State changes emitted as events. Renderers subscribe to state
- **ActionDispatcher** — components trigger actions from a predefined vocabulary. Actions flow upward to the engine, which is the single authority on state mutations. Component actions (e.g., `scan.verify`) ultimately resolve to engine-level state operations (e.g., `updateSaveState`, `updateSharedState`)
- **ComponentManifest** — schema for declaring components a story uses, their versions, per-node config, and `compatibleEngineVersions`. Validated at load time

**Action flow:**
```
Component triggers action (e.g., scan.verify)
  -> ActionDispatcher routes to engine
    -> Engine mutates state (updateSaveState / updateSharedState)
      -> State change emitted as event
        -> Component state machine transitions
          -> Renderer re-renders via render()
```

**Components define a render function** as part of their interface. Not wired to real UI in this phase, but the contract is complete from day one.

**No component implementations yet** — this phase builds the framework they plug into.

**Testing:** Mock components exercising full lifecycle: registration -> state machine transitions -> action dispatch -> engine response.

**Key constraint:** No rendering logic in this phase.

---

### Phase 4: Multiplayer Infrastructure

**Goal:** Session management, role assignment, and real-time shared state sync using Supabase Realtime.

**Touches:** `packages/engine/`, `packages/db/`

**Modules:**
- **SessionManager** — creates sessions, generates invite codes, handles join/leave. Lifecycle: `lobby -> active -> completed`
- **RoleAssigner** — assigns roles in the lobby. Supports manual selection or random assignment. Validates required roles filled before start
- **SharedStateSync** — bridges engine shared state with Supabase Realtime channels. Broadcasts shared state mutations to all session players. Conflict resolution: last-write-wins with server timestamps for v1
- **ConnectivityManager** — base connectivity abstraction that tracks online/offline per player. Queues mutations offline, replays on reconnect. Blocks progression on actions requiring sync. Phase 7's ConnectivityGuard extends this for external service calls

**Database schema extensions (building on Phase 1 skeleton):**
- `sessions` — add invite_code, status, shared_game_state (JSONB)
- `session_players` table (session_id, user_id, role_id, joined_at)

**Key design decision:** Engine remains pure — SharedStateSync is an adapter that listens to engine state-change events and pushes through Realtime channels. Engine just sees state updates.

**Testing:** Simulated multi-player sessions with mock Realtime channels. State mutation visibility across players, offline queuing/replay.

---

### Phase 5: Mobile Shell

**Goal:** Expo app skeleton — navigation, StoryShell, component rendering bridge, and auth.

**Package:** `apps/mobile/`

**Deliverables:**
- **Auth flow** — Supabase auth: signup, login, password reset. Auth context app-wide. Lazy auth — only required for starting stories, joining sessions, profile
- **Navigation** — story discovery (list view + map view), story detail, lobby/session join, active story player. Discovery is public/unauthenticated
- **StoryShell** — wrapper hosting a running story. Receives engine state and current node. Game-level UI: loading states, menus, settings. Renders current node's components into a render slot
- **ShellRegistry** — stories declare a custom shell or fall back to default. Registered by name, same pattern as components
- **ComponentRenderer** — bridge layer. Subscribes to engine state, calls component render functions, maps UI interactions back to component actions. Wraps each component in an error boundary for isolation
- **SessionUI** — lobby screen (waiting for players, role selection), invite code display/entry (copy to clipboard for sharing), player status during active play
- **StoryBundleManager** — downloads story bundles from storage URLs, caches them locally on device, checks for updates, and serves bundles to the engine. Handles partial download recovery. Enables offline play after initial download

**Not included:** Actual component UIs (Phase 6), polish/theming/animations.

**Key constraint:** Shell and renderer are thin layers. All logic lives in engine and component system.

---

### Phase 6: Component Implementations

**Goal:** Build logic + render functions for every interaction type the first story needs.

**Touches:** `packages/components/`, `apps/mobile/`

**Components:**

- **TextBlock** — narrative content, dialogue, clues. Styled text. State: `idle -> read`

- **SelectGate** — pick from options. State: `waiting -> submitted -> correct/incorrect`

- **PasswordGate** — free text entry matched against expected value. Shares base state machine with SelectGate. State: `waiting -> submitted -> correct/incorrect`

- **KeycodeGate** — numeric/alphanumeric code entry. Shares base state machine. State: `waiting -> submitted -> correct/incorrect`

- **GeolocationGate** — checks player location against target coordinates + radius. Single component with `displayMode` config:
  - `map` — shows target on map, unlocks in range
  - `compass` — directional guidance toward target
  - `hint` — text-based clues, unlocks in range
  - Location `category` field included (ad-ready). Component exposes a location resolver interface where the ad service can be plugged in later
  - State: `locked -> in_range -> unlocked`

- **ScanGate** — handles QR codes and NFC tags. Validates scanned payload against expected value. State: `waiting -> scanned -> verified`

- **TimerGate** — countdown that unlocks a path or forces transition. Configurable duration. State: `idle -> running -> expired`

- **TwilioCall** — phone calls with characters:
  - `outbound` — platform calls the player
  - `inbound` — player calls a provisioned number, hears character
  - State: `pending -> ringing -> answered -> completed`

- **TwilioSMS** — SMS with characters:
  - Outbound messages from characters
  - Inbound replies from players
  - State: `pending -> sent -> replied`

**Each component delivers:** state machine definition, action vocabulary, render function (React Native UI), Zod config schema, headless tests.

**Design decisions:**
- Choice-type gates (Select, Password, Keycode) are **separate components** sharing a base state machine — their logic, validation, and render functions diverge enough to warrant separation
- GeolocationGate is a **single component with display modes** — core logic (coordinate check) is identical, only UI guidance differs

---

### Phase 7: External Services

**Goal:** Service layer connecting component actions to external systems (Twilio), with connectivity awareness.

**Touches:** `packages/engine/`, `apps/api/`

**Modules:**
- **ServiceRegistry** — registers external services by name. Services declare capabilities and connectivity requirements. Components query availability
- **ServiceAdapter interface** — standardized contract: `initialize`, `execute`, `getStatus`. Each service implements this. Keeps engine decoupled from providers
- **TwilioAdapter** — implements ServiceAdapter:
  - Outbound calls (character calls player)
  - Inbound call routing (player calls provisioned number)
  - Outbound SMS
  - Inbound SMS handling
- **Hono API endpoints** — server-side handlers for Twilio webhooks (call status callbacks, inbound SMS/call routing). Mobile app never talks to Twilio directly
- **ConnectivityGuard** — extends Phase 4's ConnectivityManager for external service calls. Wraps service calls with connectivity checks, queues intent if offline, blocks progression with "reconnect to continue" state. Retries on reconnect

**Credential management:** Twilio credentials in API env vars. Never in app or story bundles.

**Testing:** Mock TwilioAdapter for headless tests. Integration tests with Twilio test credentials.

---

### Phase 8: Story Bundling & Discovery API

**Goal:** Bundle generation, publishing, and the player-facing API for finding and downloading stories.

**Touches:** `packages/schemas/`, `apps/api/`, S3 or equivalent

**Deliverables:**
- **Bundle Generator** — takes a validated story (validation happens in engine, Phase 2) and produces optimized bundles:
  - Master story graph blob
  - Per-role storyline blobs (self-contained for offline play)
  - Asset manifest
  - Uploaded to S3 or equivalent object storage
- **Publish flow** — API endpoint: accepts story JSON, validates via engine's StoryValidator, bundles, uploads, writes story record to Postgres with storage URLs
- **Story Discovery API** — Hono API endpoints for the player-facing experience:
  - List stories (with filtering by location, category)
  - Story detail (metadata, roles, starting location)
  - Story download URL (returns signed S3 URLs for the mobile app's StoryBundleManager)
- **Wire discovery UI to real backend** — replace the hardcoded/local JSON from Phase 5 with the real API

**Key constraint:** Bundle format is versioned from day one. Every bundle includes engine version field.

---

### Phase 9: Analytics Foundation

**Goal:** Event logging for full observability of player behavior.

**Touches:** `packages/engine/`, `apps/mobile/`, `apps/api/`

**Deliverables:**
- **EventLogger** — captures engine events (node_entered, edge_traversed, action_performed, state_changed, session_joined, role_assigned) to local event log. Schema: timestamp, event type, node ID, player ID, session ID, context payload
- **BatchSync** — periodically flushes local log to API in batches. Handles offline — events accumulate locally, sync on reconnect. No events dropped
- **Analytics ingestion endpoint** — Hono API endpoint receiving batches, writing to Postgres
- **Separation from engine state** — event log is observational only. Never feeds back into engine state machine

**Not included in v1:** Dashboards, funnel analysis, retention metrics. PostHog/Mixpanel and Sentry integration deferred to post-v1 — can be added as lightweight additions when there are real users.
