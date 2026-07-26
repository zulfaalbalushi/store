import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../server/database/postgres-migrations/001_initial_store_schema.sql',
  import.meta.url,
);

test('PostgreSQL migration is isolated from existing public tables', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.match(migration, /SET LOCAL search_path = store_portal, public;/);
  assert.match(migration, /CREATE TABLE users/);
  assert.doesNotMatch(migration, /\b(?:ALTER|DROP|TRUNCATE)\s+TABLE\b/i);
  assert.doesNotMatch(migration, /\bpublic\.(?:users|listings|orders|order_items)\b/i);
});
