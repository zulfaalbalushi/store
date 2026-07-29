import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { runMigrations } from './migrate.js';
import { openPostgresDatabase } from './postgres.js';

export async function openDatabase(databasePath) {
  await mkdir(path.dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA journal_mode = WAL');
  database.exec('PRAGMA busy_timeout = 5000');
  try {
    await runMigrations(database);
  } catch (error) {
    database.close();
    throw error;
  }

  return {
    all(sql, ...parameters) {
      return database.prepare(sql).all(...parameters);
    },
    checkHealth() {
      const result = database.prepare('SELECT 1 AS healthy').get();
      return result.healthy === 1;
    },
    exec(sql) {
      database.exec(sql);
    },
    get(sql, ...parameters) {
      return database.prepare(sql).get(...parameters);
    },
    insert(sql, ...parameters) {
      return Number(database.prepare(sql).run(...parameters).lastInsertRowid);
    },
    run(sql, ...parameters) {
      return database.prepare(sql).run(...parameters);
    },
    async transaction(callback) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const result = await callback(this);
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    close() {
      database.close();
    },
  };
}

export async function openConfiguredDatabase(config) {
  if (config.databaseType === 'postgresql') {
    return openPostgresDatabase(config.databaseUrl, config.databaseCaPath);
  }

  return openDatabase(config.databasePath);
}
