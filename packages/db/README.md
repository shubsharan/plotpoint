# @plotpoint/db

Database schema and migrations for Plotpoint using Drizzle ORM with PostgreSQL (Supabase).

## Overview

This package contains:

- Drizzle ORM schema definitions
- Database type exports for Supabase client
- Migration configuration

## Schema

### Core Tables

#### `stories`
Main story metadata.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| title | text | Story title |
| slug | text | URL-friendly identifier |
| description | text | Story description |
| author_id | uuid | Author user ID |
| status | enum | draft, published, archived |
| start_node_id | uuid | First node to display |
| is_multiplayer | boolean | Multiplayer enabled |
| min_players | integer | Minimum players required |
| max_players | integer | Maximum players allowed |

#### `nodes`
Story nodes (screens/scenes).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| story_id | uuid | Parent story |
| node_key | text | Unique key within story |
| node_type | text | Component type name |
| component_version_id | uuid | Specific version (optional) |
| data | jsonb | Component props |
| position | jsonb | Visual editor position |
| order | integer | Display order |

#### `edges`
Connections between nodes.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| source_node_id | uuid | Origin node |
| target_node_id | uuid | Destination node |
| edge_type | enum | default, choice, conditional |
| label | text | Choice button text |
| condition | jsonb | Conditional logic |
| priority | integer | Evaluation order |
| allowed_roles | jsonb | Multiplayer role filter |

### Component Versioning Tables

#### `component_types`
Registry of component types.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Internal name (text_chapter) |
| display_name | text | Human-readable name |
| category | enum | narrative, interaction, media, logic, multiplayer |

#### `component_versions`
Versioned implementations.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| component_type_id | uuid | Parent type |
| major | integer | Major version |
| minor | integer | Minor version |
| patch | integer | Patch version |
| props_schema | jsonb | JSON Schema for validation |
| default_props | jsonb | Default prop values |
| dependencies | jsonb | Required component versions |
| is_deprecated | boolean | Deprecation flag |

#### `story_manifests`
Version requirements per story.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| story_id | uuid | Parent story |
| required_components | jsonb | Version constraints |
| engine_version | text | Engine version |
| resolved_components | jsonb | Cached resolution |

### Session Tables

#### `story_sessions`
Single-player progress.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Player user ID |
| story_id | uuid | Story being played |
| current_node_id | uuid | Current position |
| game_state | jsonb | Custom state variables |
| inventory | jsonb | Collected items |
| visited_nodes | jsonb | Node visit history |
| choice_history | jsonb | Choices made |
| is_complete | boolean | Story finished |

#### `multiplayer_sessions`
Multiplayer game sessions.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| story_id | uuid | Story being played |
| host_user_id | uuid | Session host |
| invite_code | text | Join code |
| status | enum | waiting, active, completed, abandoned |
| player_slots | jsonb | Connected players |
| shared_state | jsonb | Synchronized state |
| sync_points | jsonb | Sync node IDs |

## Usage

```typescript
import { stories, nodes, edges } from '@plotpoint/db';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

// Query stories
const allStories = await db.select().from(stories);
```

## Migrations

```bash
# Generate migration from schema changes
pnpm db:generate

# Push schema to database (development)
pnpm db:push

# Run migrations (production)
pnpm db:migrate
```

## Environment

```
DATABASE_URL=postgresql://user:pass@host:5432/database
```
