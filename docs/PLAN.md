# Plotpoint Development Plan

## Project Overview

Plotpoint is an **augmented reality storytelling platform**—the "Roblox for AR." It consists of a player app, creator tools (Plotpoint Studio), and a marketplace for location-based adventures.

The **story engine** we're building is the runtime that powers story playback in the player app.

**See [PRD.md](./PRD.md) for the complete Product Requirements Document.**

---

## Architecture Summary

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Story** | Complete interactive adventure |
| **Node** | One screen = one node (atomic unit) |
| **Block** | Content node (passive display) |
| **Gate** | Unlock node (requires input/condition) |
| **Shell** | Themed presentation wrapper |
| **Edge** | Connection between nodes |

### Engine Flow

```
Story → Shell → Version Resolver → Component Registry → Render Block/Gate
```

### Node Taxonomy

**BLOCKS (Content)**:
- `text_block` - Narrative, dialog, descriptions
- `image_block` - Photos, illustrations
- `video_block` - Video content
- `audio_block` - Narration, music, sound effects

**GATES (Unlock)**:
- `geolocation_gate` - Must be at location (specific or category)
- `choice_gate` - Pick one option (causes branching)
- `password_gate` - Enter text or numeric code
- `qr_gate` - Scan a QR code
- `timer_gate` - Wait for duration or until specific time

### Shell Types

- `ebook` - Book-like with table of contents, chapters
- `chat` - Messaging app appearance
- `map` - Map always visible, content overlaid

---

## Current Focus: Architecture Refinement

### Phase 2 Goals

1. Implement block/gate taxonomy
2. Build shell system architecture
3. Create dynamic location system with venue support
4. Add role-based multiplayer support

---

## Progress Summary

### Phase 1: Engine Foundation - Complete

| Task | Status | Notes |
|------|--------|-------|
| Monorepo with Turborepo | Done | pnpm workspaces configured |
| Expo app with Router | Done | Web-first approach |
| Supabase + Drizzle ORM | Done | Schema defined |
| Database schema | Done | Core tables (needs update) |
| Shared packages | Done | types, validators, db |
| Semver utilities | Done | parse, compare, satisfies |
| Component registry | Done | Version-aware storage |
| Version resolver | Done | Constraint resolution |
| StoryRunner context | Done | React Query integration |
| NodeRenderer | Done | Error boundaries |

### Phase 2: Architecture Refinement - In Progress

| Task | Status | Notes |
|------|--------|-------|
| Update documentation | Done | PRD, README, PLAN updated |
| Schema redesign | Pending | Block/gate taxonomy, shells, venues |
| Type definitions | Pending | Update for new taxonomy |
| Validators | Pending | Update Zod schemas |
| Component refactoring | Pending | Rename to block/gate pattern |
| Shell system | Pending | Create shell abstraction |
| Location system | Pending | Venue integration |

### Phase 3: Core Components

#### Blocks (Content)

| Component | Version | Status | Description |
|-----------|---------|--------|-------------|
| TextBlock | v1.0.0 | Exists (as text_chapter) | Narrative text with typing effect |
| ImageBlock | v1.0.0 | Pending | Display images |
| VideoBlock | v1.0.0 | Exists (as video_player) | Video playback |
| AudioBlock | v1.0.0 | Pending | Audio playback |

#### Gates (Unlock)

| Component | Version | Status | Description |
|-----------|---------|--------|-------------|
| ChoiceGate | v1.0.0 | Exists (as choice_dialog) | Branching choices |
| GeolocationGate | v1.0.0 | Pending | GPS-based unlocks |
| PasswordGate | v1.0.0 | Pending | Code/password entry |
| QRGate | v1.0.0 | Pending | QR code scanning |
| TimerGate | v1.0.0 | Pending | Time-based unlock |

#### Other

| Component | Version | Status | Description |
|-----------|---------|--------|-------------|
| InventoryAction | v1.0.0 | Exists | Add/remove/check items |
| End | v1.0.0 | Exists | Story endings |

### Phase 4: Player App Features - Pending

| Feature | Status | Notes |
|---------|--------|-------|
| Authentication | Pending | Supabase Auth |
| Profile & achievements | Pending | Badges, history |
| Story discovery | Pending | List + map view |
| Offline mode | Pending | Download stories |
| Analytics | Pending | Telemetry events |
| Multiplayer | Pending | Roles, sync points |

---

## Schema Changes Required

The database schema needs significant updates:

### Stories Table Updates
- Add `shell_type` field
- Add `geography_type`: single_city, multi_region, location_agnostic
- Add `estimated_duration_minutes`
- Add `genre_id` reference

### Nodes Table Updates
- Change `node_type` to block/gate taxonomy
- Add `node_category` enum: block, gate
- Add `chapter_id` for optional grouping

### New Tables

| Table | Purpose |
|-------|---------|
| `shells` | Shell type definitions and settings |
| `genres` | Story categories |
| `venues` | Cached venue data from OSM |
| `venue_categories` | Category definitions |
| `achievements` | Achievement definitions |
| `user_achievements` | User's earned achievements |
| `story_downloads` | Offline download tracking |
| `events` | Analytics/telemetry events |
| `story_roles` | Role definitions for multiplayer |

### Multiplayer Updates
- Add `role` field to player slots
- Add `is_required` to roles
- Add `sync_behavior` configuration

### Location Fields (for geolocation gates)
- `location_type`: specific, category, none
- `location_category`: venue category name
- `location_coordinates`: specific lat/lng
- `radius_meters`: configurable precision
- `fallback_type`: behavior for poor GPS

---

## File Structure

```
plotpoint/
├── apps/mobile/
│   ├── app/
│   │   ├── _layout.tsx           Done
│   │   ├── index.tsx             Done
│   │   ├── story/[storyId].tsx   Done
│   │   ├── (auth)/               Pending
│   │   ├── browse/               Pending
│   │   └── profile/              Pending
│   └── src/
│       ├── engine/
│       │   ├── registry/         Done (needs update)
│       │   ├── runtime/          Done (needs shell support)
│       │   └── shells/           Pending (new)
│       ├── components/
│       │   ├── blocks/           Pending (reorganize)
│       │   │   ├── text-block/v1.0.0/
│       │   │   ├── image-block/v1.0.0/
│       │   │   ├── video-block/v1.0.0/
│       │   │   └── audio-block/v1.0.0/
│       │   ├── gates/            Pending (reorganize)
│       │   │   ├── choice-gate/v1.0.0/
│       │   │   ├── geolocation-gate/v1.0.0/
│       │   │   ├── password-gate/v1.0.0/
│       │   │   ├── qr-gate/v1.0.0/
│       │   │   └── timer-gate/v1.0.0/
│       │   └── other/
│       │       ├── inventory-action/v1.0.0/
│       │       └── end/v1.0.0/
│       ├── services/
│       │   └── venue-service.ts  Pending (new)
│       └── lib/                  Done
├── packages/
│   ├── db/                       Needs schema update
│   ├── types/                    Needs type updates
│   └── validators/               Needs schema updates
└── docs/
    ├── PRD.md                    Done
    └── PLAN.md                   Done
```

---

## Architecture Decisions

### 1. Blocks vs Gates Taxonomy

**Decision**: Nodes are categorized as blocks (content) or gates (unlock).

**Why**: Clear separation of passive display (blocks) from interactive requirements (gates). Makes component design clearer.

### 2. Shell System

**Decision**: Stories have a themed shell that controls presentation.

**Why**: Same content can look like an ebook, chat app, or map-centric experience. Creators choose the feel without changing content.

### 3. Dynamic Locations

**Decision**: Geolocation can specify venue categories instead of specific coordinates.

**Why**: Enables stories that work in any city with matching venues (e.g., "any coffee shop"). Opens door for venue sponsorships.

### 4. Async Multiplayer

**Decision**: Multiplayer is asynchronous—players progress at their own pace.

**Why**: Real-time sync is complex and fragile. Async with sync points is simpler and still enables coordination.

### 5. Versioned Components

**Decision**: Components use semantic versioning with manifest-based resolution.

**Why**: Stories continue working as components evolve. Backward compatibility is automatic.

---

## Technical Debt

| Item | Priority | Description |
|------|----------|-------------|
| Component rename | High | text_chapter → text_block, etc. |
| Schema update | High | Block/gate taxonomy, shells, venues |
| Shell system | High | Create shell abstraction layer |
| Venue service | Medium | OpenStreetMap integration |
| Offline support | Medium | Local storage fallback |
| Analytics | Medium | Event tracking system |

---

## Next Steps

### Immediate (Phase 2 Completion)

1. **Schema redesign**
   - Update `packages/db/src/schema/index.ts`
   - Add new tables (shells, venues, genres, achievements, etc.)
   - Update node types to block/gate taxonomy

2. **Type updates**
   - Update `packages/types/src/index.ts`
   - Add shell types, venue types, role types
   - Update component type names

3. **Validator updates**
   - Update `packages/validators/src/index.ts`
   - Add schemas for new node types
   - Update existing schemas

4. **Component refactoring**
   - Rename components to block/gate pattern
   - Reorganize into blocks/ and gates/ folders
   - Update component registry

5. **Shell system**
   - Create shell abstraction in engine/shells/
   - Implement ebook, chat, map shells
   - Integrate with StoryRunner

### Short Term

6. **Venue service**
   - Create OpenStreetMap query service
   - Implement local venue caching
   - Add venue selection UI

7. **Geolocation gate**
   - Integrate expo-location
   - Support specific and category locations
   - Map display with targets

8. **Authentication**
   - Sign up / login screens
   - Profile screen with achievements
   - Protected routes

### Medium Term

9. **Discovery UI**
   - Browse screen (list view)
   - Map view
   - Search and filters

10. **Offline mode**
    - Story download
    - Asset caching
    - Progress sync

11. **First flagship story**
    - Design complete story
    - Test all node types and shells
    - Polish and iterate

---

## Commands

```bash
# Development
pnpm dev                    # Start all apps
pnpm --filter mobile dev    # Mobile only

# Database
pnpm --filter db db:generate  # Generate migrations
pnpm --filter db db:push      # Push schema to Supabase

# Build & Check
pnpm build                  # Build all
pnpm typecheck              # Type check all packages
```

---

## Verification Plan

After Phase 2 completion:

1. **Schema validation**: Run `pnpm --filter db db:generate` to verify schema compiles
2. **Type checking**: Run `pnpm typecheck` across all packages
3. **Component registration**: Verify all blocks/gates register correctly
4. **Shell rendering**: Test each shell type with sample content
5. **Manual testing**: Create a test story using new taxonomy

---

*Last updated: January 2026 - Phase 2 (Architecture Refinement) in progress*
