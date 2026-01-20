# Plotpoint Product Requirements Document

## Executive Summary

**Plotpoint** is an augmented reality storytelling platform that connects digital narratives with the physical world. Unlike traditional AR which focuses on camera overlays, Plotpoint defines augmented reality broadly—encompassing geolocation, QR codes, environmental puzzles, and any interaction that bridges digital storytelling with real-world engagement.

The vision is to become the **"Roblox for AR"**: a comprehensive platform with creator tools (Plotpoint Studio), a player app, and a marketplace where creators build and monetize **stories** that get people outside, exploring, and engaging with their surroundings.

---

## Vision & Mission

### Vision
Bring a sense of wonder and discovery back to technology by creating experiences that connect people with the physical world and each other.

### Mission
Build the definitive AR story creation toolkit and marketplace—empowering creators to craft real-world adventures and giving players reasons to go outside, explore, and have fun with friends.

### Core Belief
People are desperate for ways to engage with the physical world in new and creative ways. Most tech companies view AR/VR pessimistically—as ad vehicles or reality replacements. Plotpoint exists to remind people when technology was fun.

---

## Core Terminology

| Term | Definition |
|------|------------|
| **Story** | A complete interactive adventure (the primary content unit) |
| **Node** | One screen of content—the atomic unit of a story |
| **Block** | A content node (passive display: text, image, video, audio) |
| **Gate** | An interactive unlock node (requires input/condition to proceed) |
| **Shell** | A themed wrapper that controls story presentation |
| **Chapter** | Optional grouping of nodes for organization (no gameplay impact) |
| **Edge** | Connection between nodes (linear, choice, conditional) |
| **Manifest** | Story's component version requirements |

---

## Product Overview

### What is Plotpoint?

Plotpoint is a three-part platform:

1. **Player App** (iOS, Android, Web) - Play stories
2. **Plotpoint Studio** - No-code visual builder for creating stories
3. **Marketplace** - Discover, purchase, and monetize stories

### What is a "Story"?

A story is an interactive adventure that blends digital content with real-world interaction. Each story is composed of **nodes** (one node = one screen), connected by **edges** that define the narrative flow. Stories have a **shell** that controls their visual presentation.

**Example stories:**
- **Urban mystery**: Solve a murder by visiting real locations, scanning clues, interrogating NPCs via text messages
- **City-wide escape room**: Teams race through downtown solving puzzles unlocked by GPS and QR codes
- **Historical tour**: Walk through a neighborhood while characters from the past narrate their stories
- **Corporate team building**: Company scavenger hunt with role-based objectives and multiplayer coordination

### Multi-Channel AR

Plotpoint's definition of "augmented reality" extends beyond camera-based experiences:

| Channel | Description |
|---------|-------------|
| **Geolocation** | Content unlocks at specific GPS coordinates or venue categories |
| **QR Codes** | Scan physical codes to trigger story events |
| **Environmental Puzzles** | Solve puzzles using real-world surroundings |
| **Image Recognition** | Camera identifies objects, signs, artwork |
| **Camera AR** | Traditional 3D overlays on camera view |
| **Audio** | Location-triggered narration and soundscapes |
| **Time-based** | Content available only at certain times |

---

## Node Taxonomy: Blocks & Gates

Nodes are categorized into two types. Blocks and gates are **always separate nodes** (never combined).

### BLOCKS (Content Nodes)

Blocks are passive content displays—the player reads/watches/listens.

| Block Type | Description | MVP |
|------------|-------------|-----|
| **Text Block** | Narrative, dialog, descriptions | Yes |
| **Image Block** | Photos, illustrations | Yes |
| **Video Block** | Video content | Yes |
| **Audio Block** | Narration, music, sound effects | Yes |
| 3D/AR Block | 3D objects in camera view | Future |

### GATES (Unlock Nodes)

Gates require player input or a condition to proceed to the next node.

| Gate Type | Description | MVP |
|-----------|-------------|-----|
| **Geolocation Gate** | Must be at location (specific or category) | Yes |
| **Single Choice Gate** | Pick one option (causes branching) | Yes |
| **Password/Code Gate** | Enter text or numeric code | Yes |
| **QR Code Gate** | Scan a QR code | Yes |
| **Timer Gate** | Wait for duration or until specific time | Yes |
| Multi-select Gate | Pick multiple options | Future |
| Puzzle Gate | Interactive puzzles (jigsaw, cipher, etc.) | Future |
| Inventory Gate | Require specific items | Future |

---

## Shell System

Stories have a **shell**—a wrapper that determines presentation and controls how components are rendered.

### Shell Capabilities

- Controls how blocks and gates are rendered
- Provides game-level UI (leaderboard, options, save management)
- Applies theming
- Can override component rendering

### MVP Shells

| Shell | Description |
|-------|-------------|
| **Ebook Shell** | Book-like with table of contents, chapters |
| **Chat Shell** | Looks like messaging app, nodes appear as messages |
| **Map Shell** | Map always visible, content overlaid |

**Note:** Creator chooses the shell; players cannot change it.

---

## Location System

Plotpoint supports a **dynamic location system** that enables flexible venue selection.

### Location Types

| Type | Description |
|------|-------------|
| **Specific** | Exact GPS coordinates (latitude/longitude) |
| **Category** | Venue type (e.g., "coffee_shop", "park", "museum") |
| **None** | No location requirement |

### How Dynamic Locations Work

1. **Creators specify category** instead of specific coordinates (e.g., "any coffee shop")
2. **System queries venues** from OpenStreetMap + our curated database
3. **Component decides presentation**: map shows pins, compass picks nearest, etc.
4. **Sponsors can be prioritized**: businesses pay to be featured in their category

### Venue Data Strategy

- Query OpenStreetMap for venue categories
- Cache locally per city/area
- Store in our database for tracking and sponsorships
- Our DB takes priority for sponsored/verified venues

### Story Geography

Creators decide story scope:
- **Single city**: Story bound to one location
- **Multi-region**: Story spans multiple cities/areas
- **Location-agnostic**: Works anywhere with matching venue categories

---

## Multiplayer Architecture

Plotpoint supports **asynchronous multiplayer**—players progress at their own pace, not in real-time synchronization.

### Multiplayer Model

| Feature | Description |
|---------|-------------|
| **Role-based** | Each player has assigned role with different content/gates |
| **Shared state** | Roles share inventory and game state |
| **Communication** | Real-time chat/coordination available |
| **Sync points** | Story progresses when all reach designated points |
| **Optional roles** | Some roles can be optional or required |

### Joining

- **QR codes** and **deep links** (not invite codes)
- Host creates session, shares link
- Players join via link

### Sync Point Behavior

Creator configures behavior per sync point:
- Wait screen
- Side content to explore
- Push notification when all arrive
- Timeout with fallback

### Disconnect Handling

- **Optional roles**: Story continues without them
- **Required roles**: Host must reassign before story advances

---

## Target Users

### Players

**Primary**: Groups of friends (2-6 people) looking for social activities
- Age: 18-35
- Urban/suburban
- Value experiences over possessions
- Looking for reasons to explore their city

**Secondary**: Tourists exploring new destinations
- Want guided experiences with narrative depth
- Prefer self-paced over rigid tour schedules

**Tertiary**: Corporate teams for team building events

### Creators (Future)

**Initial**: Plotpoint internal team
**Future**:
- Game designers and writers
- Escape room companies
- Tourism boards and museums
- Event planners
- Educators

---

## Use Cases

### 1. Tourism & Exploration
- City discovery games
- Historical walking tours
- Neighborhood scavenger hunts
- Museum companion experiences

### 2. Events & Entertainment
- Festival activations
- Concert treasure hunts
- Pop-up immersive theater
- Themed experiences (Halloween, holidays)

### 3. Corporate & Team Building
- Onboarding adventures
- Team scavenger hunts
- Training gamification
- Company culture experiences

### 4. Social Entertainment
- Date night adventures
- Birthday party games
- Bachelor/bachelorette activities
- Friend group challenges

---

## MVP Requirements

### In Scope for MVP

#### Authentication
- Email + password
- Social login (Google, Apple)
- Supabase Auth handles this

#### Profile & Achievements
- Basic public profile
- Achievements/badges for completed stories
- Play history (private to user)

#### Discovery
- List view with grid of stories
- Map view showing story locations
- Search and filters (location, genre, duration)

#### Story Playback
- All MVP blocks: Text, Image, Video, Audio
- All MVP gates: Geolocation, Single Choice, Password, QR, Timer
- All MVP shells: Ebook, Chat, Map
- Progress saving and resume
- Auto-save after each node

#### Multiplayer
- Async multiplayer with roles
- Role-based content/gates
- Shared inventory and state
- Sync points with configurable behavior
- QR code and deep link joining

#### Offline Mode
- Download stories for offline play
- Cache assets locally
- Sync progress when back online

#### Analytics
- Track player behavior (node visits, time spent, choices made)
- Creator analytics (how players interact with their stories)
- Platform analytics (popular stories, retention)

### NOT in MVP

- Payments (free to play initially)
- Friends system
- Activity feed
- Social sharing
- Plotpoint Studio
- Marketplace
- Creator tools
- In-app purchases
- Subscriptions

---

## Data Model Summary

### Core Tables

| Table | Description |
|-------|-------------|
| `stories` | Main story container with metadata |
| `nodes` | Graph nodes (blocks and gates) |
| `edges` | Connections between nodes |
| `shells` | Shell type definitions and settings |
| `venues` | Cached venue data from OSM |
| `venue_categories` | Category definitions (coffee_shop, park, etc.) |
| `genres` | Story genres/categories |

### Session Tables

| Table | Description |
|-------|-------------|
| `story_sessions` | Single-player progress tracking |
| `multiplayer_sessions` | Multiplayer session management |
| `player_roles` | Role assignments for multiplayer |

### User Tables

| Table | Description |
|-------|-------------|
| `profiles` | User profile data |
| `achievements` | Achievement definitions |
| `user_achievements` | User's earned achievements |

### Analytics Tables

| Table | Description |
|-------|-------------|
| `events` | Telemetry events |
| `story_downloads` | Offline download tracking |

---

## Technical Architecture

### Platform Support

| Platform | Priority | Technology |
|----------|----------|------------|
| iOS | P0 | React Native (Expo) |
| Android | P0 | React Native (Expo) |
| Web | P0 | Expo Web |
| Plotpoint Studio | Future | Next.js or Expo Web |

### Core Technology

- **Frontend**: Expo (React Native) - web-first approach
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Storage)
- **State Management**: TanStack React Query
- **Validation**: Zod schemas
- **Versioning**: Semantic versioning for components

### Engine Architecture

The engine uses a versioned component system:

```
Story → Shell → Version Resolver → Component Registry → Render Block/Gate
```

**Key concepts**:
- **Blocks**: Content nodes (text, image, video, audio)
- **Gates**: Unlock nodes (geolocation, choice, password, QR, timer)
- **Shells**: Themed wrappers (ebook, chat, map)
- **Components**: Versioned UI implementations
- **Manifest**: Story's component version requirements

This ensures backward compatibility—stories continue working as components evolve.

---

## Success Metrics

### Player Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| DAU/MAU | >30% | Daily engagement ratio |
| Completion Rate | >60% | % of started stories finished |
| Replay Rate | >20% | % playing same story twice |
| NPS | >50 | Net Promoter Score |

### Creator Metrics (Future)

| Metric | Target | Description |
|--------|--------|-------------|
| Published Stories | 100+ in Y1 | Platform catalog size |
| Creator Earnings | $10k+ avg/yr | Top creator monetization |
| Create-to-Publish | <1 week | Time to create first story |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| GPS inaccuracy | Poor user experience | Configurable radius per gate, fallback behaviors |
| Content quality | Low retention | Internal creation first, careful curation |
| Safety concerns | Liability | Clear safety guidelines, daylight recommendations |
| Weather dependency | Seasonal usage dips | Indoor venue categories, weather alerts |
| Platform fees (30%) | Margin pressure | Subscription model, B2B focus |

---

## Roadmap

### Phase 1: Engine Foundation - Complete
- Monorepo setup
- Component versioning system
- Core node types (text, choice, video, inventory, end)
- Story runner architecture

### Phase 2: Architecture Refinement - Current
- Block/gate taxonomy implementation
- Shell system architecture
- Dynamic location system
- Venue integration (OpenStreetMap)
- Role-based multiplayer

### Phase 3: Player App MVP
- Authentication flow
- Discovery UI (list + map)
- All MVP blocks and gates
- Offline mode
- Analytics integration
- 2-3 flagship stories

### Phase 4: Social & Polish
- Achievements system
- Profile improvements
- Push notifications
- Performance optimization

### Phase 5: Creator Tools (Future)
- Plotpoint Studio MVP
- Visual node editor
- Location tools
- Publishing workflow

### Phase 6: Marketplace (Future)
- Third-party creator onboarding
- Revenue sharing
- Discovery algorithms
- Creator analytics

---

## Open Questions

1. **Venue data licensing**: What are OSM's terms for commercial use?
2. **Location permissions**: How do we handle users who deny location access?
3. **International expansion**: Which markets after initial launch?
4. **Accessibility**: How do we make location-based stories accessible?
5. **Hardware AR**: When/how do we support AR glasses?

---

## Appendix

### Glossary

| Term | Definition |
|------|------------|
| Story | A complete interactive adventure |
| Node | Single screen in a story |
| Block | Content node (passive display) |
| Gate | Unlock node (requires input/condition) |
| Shell | Themed wrapper controlling presentation |
| Edge | Connection between nodes |
| Manifest | Story's component version requirements |
| Multi-channel AR | AR through geo, QR, camera, audio, etc. |

### References

- [Roblox Creator Economy](https://developer.roblox.com/)
- [Pokemon Go Location Gaming](https://pokemongolive.com/)
- [Escape Room Industry](https://www.escaperoomowner.com/)
- [OpenStreetMap](https://www.openstreetmap.org/)

---

*Document Version: 2.0*
*Last Updated: January 2026*
