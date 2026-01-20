# @plotpoint/mobile

The Plotpoint player app for iOS, Android, and Web.

## Overview

This is the main client application where players discover, purchase, and play AR experiences. Built with Expo (React Native) using a web-first approach.

## Features (MVP)

- [ ] Browse and discover experiences
- [ ] Purchase experiences
- [ ] Play complete stories with all node types
- [ ] Save and resume progress
- [ ] Multiplayer with friends
- [ ] Leaderboards and badges

## Project Structure

```
apps/mobile/
├── app/                    # Expo Router pages
│   ├── _layout.tsx         # Root layout
│   ├── index.tsx           # Home/discovery
│   ├── story/[storyId].tsx # Story player
│   ├── (auth)/             # Auth screens (planned)
│   └── profile/            # User profile (planned)
└── src/
    ├── engine/             # Story playback engine
    │   ├── registry/       # Component versioning
    │   └── runtime/        # Story runner
    ├── components/         # Versioned story components
    │   ├── text-chapter/
    │   ├── choice-dialog/
    │   ├── video-player/
    │   ├── inventory-action/
    │   ├── end/
    │   ├── qr-scanner/     # (planned)
    │   └── geolocation-lock/ # (planned)
    └── lib/                # Utilities
```

## Story Engine

The engine uses versioned components to ensure backward compatibility:

```
Story Manifest → Version Resolver → Component Registry → Render
```

### Node Types

| Type | Description | Status |
|------|-------------|--------|
| `text_chapter` | Narrative text | ✅ |
| `choice_dialog` | Branching choices | ✅ |
| `video_player` | Video content | ✅ |
| `inventory_action` | Item management | ✅ |
| `end` | Story endings | ✅ |
| `qr_scanner` | QR code scanning | 🔲 |
| `geolocation_lock` | GPS unlocks | 🔲 |
| `puzzle_solver` | Puzzles | 🔲 |

### Adding Components

1. Create folder: `src/components/<name>/v<version>/`
2. Add files: `index.tsx`, `schema.ts`, `types.ts`
3. Component calls `registerComponent()` at module level
4. Import in `src/components/_registry.ts`

## Development

```bash
# Start development server
pnpm dev

# Platform-specific
pnpm ios
pnpm android
pnpm web

# Type check
pnpm typecheck
```

## Environment

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Path Aliases

- `@/*` → `./src/*`
- `@engine/*` → `./src/engine/*`
- `@lib/*` → `./src/lib/*`
- `@components/*` → `./src/components/*`
- `@plotpoint/schemas` → `../../packages/types/src`
- `@plotpoint/schemas` → `../../packages/schemas/src`
