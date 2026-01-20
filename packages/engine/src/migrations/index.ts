import type { Story } from '@plotpoint/db';
import { parseSemVer, compareSemVer } from '../semver';

export interface Migration {
  name: string;
  fromVersionConstraint: string;  // e.g., "<2.0.0"
  toVersion: string;              // e.g., "2.0.0"
  migrate: (story: unknown) => unknown;
}

// Registry of all migrations (add new ones here)
const migrations: Migration[] = [
  // Example for future v2:
  // shellsToLayouts,
];

/**
 * Apply all necessary migrations to bring a story up to current engine version.
 * Migrations are applied in order, transforming the story data format.
 */
export function migrateStory<T extends { engineVersion?: string }>(
  story: T
): T {
  if (!story.engineVersion) return story;

  let migrated = story as unknown;

  for (const migration of migrations) {
    const storyVersion = parseSemVer(
      (migrated as { engineVersion?: string }).engineVersion ?? '1.0.0'
    );
    const targetVersion = parseSemVer(migration.toVersion);

    if (storyVersion && targetVersion && compareSemVer(storyVersion, targetVersion) < 0) {
      console.log(`Applying migration: ${migration.name}`);
      migrated = migration.migrate(migrated);
    }
  }

  return migrated as T;
}

export { migrations };
