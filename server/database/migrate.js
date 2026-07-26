import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DEFAULT_MIGRATIONS_DIRECTORY = fileURLToPath(new URL('./migrations/', import.meta.url));

export async function runMigrations(database, migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const appliedMigrations = new Set(
    database
      .prepare('SELECT filename FROM schema_migrations')
      .all()
      .map((row) => row.filename),
  );
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((filename) => filename.endsWith('.sql'))
    .sort();

  for (const filename of migrationFiles) {
    if (appliedMigrations.has(filename)) continue;

    const migrationSql = await readFile(path.join(migrationsDirectory, filename), 'utf8');

    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(migrationSql);
      database.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(filename);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw new Error(`Migration ${filename} failed`, { cause: error });
    }
  }
}
