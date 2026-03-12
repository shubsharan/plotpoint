# Plotpoint — Architecture & Product Decisions

## 1. Product Vision & Platform

**Narrative-first, location-based experiences.** PlotPoint targets murder mysteries, treasure hunts, and real-world adventure stories rather than general-purpose AR. This shapes the studio tool, component palette, and overall product focus.

**Multi-platform interaction model.** "AR" means more than cameras — it includes SMS, Twilio phone calls, geolocation, QR codes, real-world websites, and other physical-world touchpoints. The world itself is the interface.

**Roblox-style ecosystem.** Stories are played inside a single central PlotPoint app, not as standalone App Store submissions. Creators publish to the platform through a studio tool.

**Open creator ecosystem (future).** Near-term stories are co-authored directly with game designers using JSON tooling. A visual builder and open third-party ecosystem come later.

**Tech stack:** Expo for the mobile app.

---

## 2. Core Game Model

**Story-as-graph.** Each story is a directed graph where nodes are scenes or checkpoints and edges are conditional transitions between them.

**Multiplayer with role-based storylines.** Each player follows their own personal storyline based on their role. Players are never on the same node simultaneously — a detective and a witness have separate paths that influence each other through shared state.

**Split persistence: personal save file + shared game state.** Each player has their own save file for personal progress. The story also has a shared state that spans all players. Actions affecting shared state force a backend sync.

**Local-first, sync at critical points.** Players progress locally without constant network calls. Syncing is only forced when a player impacts the shared game state. Solo experiences remain viable offline.

---

## 3. Node & Edge Structure

**Shared node definitions with player-specific state tracking.** Nodes are defined once; player progress is tracked separately. Avoids redundancy and makes shared scenes across roles easier to manage.

**Edges are defined separately from nodes.** A node is self-contained. Edges independently connect nodes in the graph, making nodes reusable and allowing multiple incoming and outgoing connections.

**Conditions live on edges.** Each edge has a condition tree that gates traversal. The engine evaluates all outgoing edges from the current node and follows the first one whose conditions are satisfied.

**Priority-ordered edge evaluation with optional override.** First-match is the default. Creators can assign explicit priority rankings when they need a specific order.

**Conditions are composed as trees using a constraint language.** Predefined condition types — "equals," "greater than," "matches pattern," "player has role," "node unlocked" — are chained with AND/OR operators. The entire tree is validated at publish time.

---

## 4. Component System

**Global component registry.** Components are registered at app startup and referenced by name in manifests. Config is passed separately. Implementations can be swapped without touching story files.

**Separation of component logic and UI rendering.** Business logic is decoupled from rendering. Stories can be tested headlessly. Different UI renderers can be swapped per story or platform.

**State machine model.** Components use internal state machines with defined states and transitions (e.g., a QR scanner: "waiting" → "scanned" → "verified"). Renderers subscribe to state changes.

**Predefined action vocabulary per component type.** Each component type has its own set of safe, predefined actions. Creators compose from this palette rather than writing arbitrary logic.

**Time-based conditions are handled at the component level.** Timing logic stays in components, not the core engine. The engine remains simple and agnostic to time.

---

## 5. StoryShell

**StoryShell wraps each experience.** Provides game-level UI — menus, loading states, settings, leaderboards, achievements. Renders the current node's components inside itself.

**Customizable via a ShellRegistry.** Stories can use the default shell or register a custom one. Custom shells receive game state, current node, and a render slot for node components.

**Fixed component palette.** Creators compose from a predefined set of shell and node components. No arbitrary React code outside the app binary. The palette expands over time based on creator needs.

---

## 6. Story Bundle Structure & Storage

**Stories are chunked into multiple blobs.** A master story graph blob, per-role storyline blobs, component manifest blobs, and separate static asset storage.

**Role storyline blobs are self-contained.** Each role blob embeds all node data it needs rather than fetching from the master graph at runtime. Supports offline playback.

**Postgres for canonical data, S3 for distribution.** Node and edge definitions live in Postgres. At publish time, optimized JSON blobs are generated and uploaded to S3. The Postgres story record links to S3 URLs. Players download from S3.

---

## 7. Engine Versioning

**Migration adapter chain.** Each major engine version has an adapter that transforms story manifests from the previous version. Adapters are isolated and testable. Adapters can be consolidated over time (e.g., v1-to-v3 rolling up two steps).

**Indefinite backwards compatibility.** Old story formats are migrated transparently at runtime. Deprecation is only considered if migration logic becomes unmaintainably complex.

**Component versioning is self-contained.** Each component version declares which engine versions it supports. Engine adapters handle story structure; components handle their own schema evolution. No separate component adapter chain needed.

**Only the latest engine ships in the binary.** Stories declare which engine version they require; the migration adapter chain handles the rest. No multiple engine versions bundled in the app.

---

## 8. Services & External Integrations

**Services are accessed through the action layer only.** Components trigger actions; actions call services. Direct service access from components is not allowed.

**Service availability state is exposed to components.** Components can query service status (online/offline/unavailable) at render time to adjust their UI accordingly.

**Forced connectivity for external service interactions.** If a player is offline when triggering an action requiring an external service, the action fails gracefully and blocks progression until reconnected.

**Service configuration lives in the backend.** Credentials and settings are loaded at app startup. Not stored in story bundles or app code. Local config file for development only.

---

## 9. Analytics & Telemetry

**Track everything.** Every node visit, action, transition, and player choice is logged for full observability.

**Local event log with batched sync.** Events are captured locally and synced in batches rather than on every action. Lightweight schema: timestamp, event type, node ID, player ID, context payload.

**Event sourcing for analytics, state machine for logic.** These are separate concerns. The state machine handles runtime behavior; the event log handles observability and telemetry.

**Product analytics and error tracking are separate tools.** PostHog or Mixpanel for player behavior and progression patterns. Sentry for crash and performance monitoring. Start with product analytics.

---

## 10. Location-Based Advertising

**Location requirements support coordinates, IDs, and category taxonomies.** Story nodes can reference a specific place, a group of places, or a category like "coffee shop." Any matching location satisfies the requirement.

**Businesses are resolved dynamically at runtime.** Story blobs contain location categories, not specific businesses. At runtime the engine queries an ad service for businesses with active campaigns matching the category and area.

**Campaign-based advertising model.** Businesses bid on story categories or specific stories with time windows and budgets. Campaigns can be paused or updated without touching story files.

**Dynamic ad insertion is viable because geolocation requires connectivity anyway.** No extra connectivity requirement is added by querying the ad service at the same time as location services.

---

## 11. Authoring & Studio Tool

**JSON-based authoring near-term.** Sufficient for the co-authoring phase with game designers. A visual node builder is planned for when the platform opens to third-party creators.

**Higher-level narrative abstraction (future).** The studio tool will let creators write scenes and choices in a storytelling format that compiles down to the node-edge graph automatically.

**AI-powered conversational story creation (future).** An AI assistant equipped with tools that understand PlotPoint's story model guides creators through building a story in natural conversation. A strong differentiator against platforms like Roblox Studio.

---

## 12. Code & System Architecture

**Monorepo with clear package boundaries.** A `packages` directory contains framework-agnostic packages: core engine, component registry, action system, service layer. An `apps` directory contains the Expo mobile app, backend API, and eventually the studio tool. The engine has no React Native dependencies, enabling headless testing.
