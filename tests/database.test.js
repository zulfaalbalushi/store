import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { openDatabase } from '../server/database/connection.js';

test('openDatabase creates a healthy SQLite database', async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'baytna-database-'));
  const databasePath = path.join(temporaryDirectory, 'test.sqlite');

  try {
    const database = await openDatabase(databasePath);
    assert.equal(database.checkHealth(), true);
    assert.equal(database.get('PRAGMA foreign_keys').foreign_keys, 1);
    assert.equal(database.get('SELECT COUNT(*) AS count FROM schema_migrations').count, 1);
    database.close();

    const reopenedDatabase = await openDatabase(databasePath);
    assert.equal(reopenedDatabase.get('SELECT COUNT(*) AS count FROM schema_migrations').count, 1);
    assert.ok(
      reopenedDatabase.get(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'businesses'",
      ),
    );
    reopenedDatabase.close();
  } finally {
    await rm(temporaryDirectory, { recursive: true });
  }
});
