| Field           | Value      |
| --------------- | ---------- |
| **Type**        | Strategy   |
| **Status**      | Active     |
| **Last synced** | 2026-04-20 |

# Plotpoint — Product Strategy

## 1. Vision

Plotpoint is a **narrative-first, location-based gaming platform**. We build murder mysteries, treasure hunts, and real-world adventure stories — not general-purpose AR or gaming. This focus shapes everything: the component palette, the creator tools, and the business model.

When we say "AR," we don't mean just camera filters. We mean the real world as the interface: SMS messages, phone calls, geolocation, QR codes, real-world websites, and physical-world touchpoints. The story doesn't exist on a screen, it exists in the places you walk through, the objects you find, the texts and calls you receive.

Plotpoint follows the Roblox platform model. Stories are played inside a single PlotPoint app, not shipped as standalone App Store submissions. Creators publish to the platform. Players browse and play within one experience. This is the ecosystem bet: a shared surface where discovery, play, and creation all happen in one place.

The product bet is simple: real-world storytelling is underserved. Walking tour apps are passive. Video games are virtual. There's a wide-open gap for interactive, multiplayer, location-aware narratives.

## 2. Target Experience

You and your friends each get a role: detective, witness, suspect, etc. Everyone has their own path through the story. The detective is examining evidence at the café while the witness is receiving a mysterious phone call two blocks away.

The story unfolds in the real world. You walk to actual locations, find real objects, receive phone calls from characters. The city is the game board.

Play offline**.** The game runs locally on your phone. It only syncs when your actions need to affect other players – when you unlock a clue that changes the shared world state, or when the story needs to verify that the required roles for a sync gate have reached it.

This is co-op narrative, not competition. The story is the point. Players work together across their separate storylines, and the experience is richer because everyone sees it from a different angle.

## 3. Game Model

Stories are directed graphs of scenes connected by conditional paths. Each scene contains interactive blocks (a video, a geolocation gate, a QR scanner) that players engage with to progress.

Each player follows a personal storyline based on their assigned role. Paths diverge and reconverge throughout the story. A detective and a witness might start at the same crime scene, split off to follow separate leads, and reconverge at the final confrontation.

Player choices and actions unlock new paths. Conditions on edges determine which transitions are available: "the door is unlocked," "three clues have been found," "the timer has expired." The engine evaluates these conditions against the current state and opens the paths that qualify.

State lives in two layers. Each player has a personal save file tracking their individual progress: where they are in the graph, which blocks they've interacted with, etc. The story also has a shared story-run state that all players can read and affect. When a detective unseals a crime scene, every player in the run sees it change. This split is what makes multiplayer narratives work without constant connectivity.

Local-first architecture means players can progress without a network connection. The game syncs only at critical points, like when a player's action touches shared state, we need access to geolocation triggers, or the story hits a sync gate that targets a required set of roles. Solo experiences work mostly offline.

## 4. Creator Ecosystem

**Phase 1: Co-authoring with game designers.** We work directly with story creators using JSON-based tooling. This is sufficient for the early catalog and lets us learn what creators actually need before building tools.

**Phase 2: Visual story builder.** A node-based editor where third-party creators can design stories visually by dragging scenes, connecting paths, and configuring blocks. This is what opens the platform to creators who aren't comfortable with raw JSON.

**Phase 3: AI-assisted story creation.** An AI assistant that understands Plotpoint's story model guides creators through building a story in natural conversation. "I want a murder mystery set in a historic district for four players." This is the thing that makes Plotpoint easier to create for than any competing platform.

Publishing follows the Roblox model: creators publish to the platform, not the App Store. Stories go through a publish pipeline that validates structure, optimizes story packages, and makes them available to players.

The component registry is fixed and curated. Creators compose from a predefined set of interactive blocks: password puzzles, geolocation gates, QR scanners, timersme etc. The registry expands over time based on what creators need, but creators never write arbitrary code. This constraint is what makes the platform safe, consistent, and AI-authorable.

## 5. Business Model

The primary revenue model is location-based advertising with a natural, non-intrusive fit. Stories reference location _categories_ — "coffee shop," "park," "historic building" — not specific businesses. When a story needs to send a player to a coffee shop, the engine queries an ad service at runtime.

Businesses bid on story categories with time-windowed campaigns. A local café can bid on "coffee shop" locations in murder mystery stories running in their area this month. Campaigns can be paused, updated, or expired without touching story files. No hardcoded business partnerships pollute the narrative.

This model has a natural technical fit: geolocation already requires connectivity, so querying the ad service adds no extra burden. The player's phone is already online to check their position, and resolving which business fills a location category is trivial.

Future: creator marketplace revenue share**.** When the open creator ecosystem launches, Plotpoint takes a percentage of story sales or in-story purchases. The flywheel is creators earning money → more creators → more stories → more players → more ad revenue → more creator earnings.

## 6. Differentiation

Not Niantic. Pokémon GO bolts location onto a game. For Plotpoint, narrative is the product. Location serves the story, not the other way around.

Not Roblox**.** Roblox is virtual worlds. Plotpoint is real-world interaction. But we borrow the platform model of a single app where creators publish and players discover.

Not walking tour apps**.** Walking tours are passive, single-player, linear content. Plotpoint is multiplayer, branching, interactive, with role-based storylines and shared world state. We may offer some single player nonfiction narratives, but must be careful to remain differentiated.

Not general AR platforms**.** We don't try to be everything. The entire component registry, tooling, and business model are **shaped around storytelling.** This focus is a feature, not a limitation.

The moat is the flywheel between three reinforcing bets: AI-assisted story creation makes it radically easy to publish; location-based advertising generates revenue without subscriptions or paywalls; and the platform model means every new story makes the app more valuable for players. Creators, players, and local businesses all benefit from growth.

## 7. Technical Foundations

- **Expo (React Native)** for cross-platform mobile
- **Hono** for deployment-agnostic server-side logic (webhooks, publishing, analytics)
- **Supabase** for Postgres, and realtime sync
- **Better-Auth** for authentication and authorization
- **Engine is pure TypeScript** — zero UI dependencies, fully headless-testable
- **Local-first architecture** with sync only at critical shared-state changes and sync gates
- **Hexagonal architecture** — the engine defines abstract ports, concrete implementations are injected at runtime
- **Drizzle ORM** with Zod validation for type-safe data access

For implementation details, see [Hexagonal + Feature-Slice Architecture](../architecture/hexagonal-feature-slice-architecture.md).
