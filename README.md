# Plotpoint

An augmented reality storytelling platform that connects digital narratives with the physical world.

## What is Plotpoint?

Plotpoint is the **"Roblox for AR"**—a platform where creators build location-based adventures and players explore the real world through interactive stories. Unlike traditional AR focused on camera overlays, Plotpoint defines augmented reality broadly:

- **Geolocation gates** - Unlock content at specific locations or venue categories
- **QR code scanning** - Find physical codes to progress
- **Environmental puzzles** - Solve challenges using real surroundings
- **Dynamic locations** - Play in any city with matching venue types
- **Camera AR** - Traditional 3D overlays (coming soon)

The mission: bring wonder and discovery back to technology by getting people outside, exploring, and having fun with friends.

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Story** | A complete interactive adventure |
| **Node** | One screen of content (atomic unit) |
| **Block** | Content node (text, image, video, audio) |
| **Gate** | Unlock node (geolocation, choice, password, QR, timer) |
| **Shell** | Themed wrapper (ebook, chat, map) controlling presentation |

## Platform Components

| Component | Description | Status |
|-----------|-------------|--------|
| **Player App** | iOS, Android, Web app for playing stories | In Development |
| **Story Engine** | Versioned component system for rendering stories | In Development |
| **Plotpoint Studio** | No-code visual builder for creators | Planned |
| **Marketplace** | Discover and purchase stories | Planned |

## Project Structure

```
plotpoint/
├── apps/
│   └── mobile/              # Expo app (iOS, Android, Web)
│       └── src/
│           ├── engine/      # Story runner, component registry
│           ├── components/  # Versioned blocks and gates
│           └── lib/         # Utilities, Supabase client
├── packages/
│   ├── db/                  # Drizzle ORM schema
│   ├── types/               # Shared TypeScript types
│   └── validators/          # Zod validation schemas
├── docs/
│   └── PRD.md               # Product Requirements Document
└── supabase/                # Edge functions (future)
```

## Tech Stack

- **Frontend**: Expo (React Native, web-first)
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Storage)
- **State**: TanStack React Query
- **Validation**: Zod
- **Monorepo**: Turborepo + pnpm

## MVP Features

### Blocks (Content)
- Text Block - Narrative, dialog, descriptions
- Image Block - Photos, illustrations
- Video Block - Video content
- Audio Block - Narration, music, sound effects

### Gates (Unlock)
- Geolocation Gate - Must be at location (specific or venue category)
- Choice Gate - Pick one option (causes branching)
- Password Gate - Enter text or numeric code
- QR Code Gate - Scan a QR code
- Timer Gate - Wait for duration or until specific time

### Shells (Presentation)
- Ebook Shell - Book-like with chapters and table of contents
- Chat Shell - Messaging app appearance
- Map Shell - Map always visible with content overlaid

### Multiplayer
- Async multiplayer - Players progress at their own pace
- Role-based content - Different content per player role
- Sync points - Story progresses when all players arrive
- QR/deep link joining - No invite codes needed

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development
pnpm dev

# Run mobile app only
pnpm --filter @plotpoint/mobile dev
```

## Documentation

- [Product Requirements Document](./docs/PRD.md) - Full product vision and requirements
- [Development Plan](./docs/PLAN.md) - Technical progress and next steps

## Story Types

Plotpoint supports various story formats:

- **Urban mysteries** - Solve crimes by visiting real locations
- **City-wide escape rooms** - Team races through downtown
- **Historical tours** - Walk through history with narration
- **Scavenger hunts** - Find items and complete challenges
- **Team building** - Corporate games with multiplayer coordination

## License

Proprietary - All rights reserved
