import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DEFAULT_MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL('./postgres-migrations/', import.meta.url),
);

export async function runPostgresMigrations(
  pool,
  migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY,
) {
  await pool.query('CREATE SCHEMA IF NOT EXISTS store_portal');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS store_portal.schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const appliedResult = await pool.query(
    'SELECT filename FROM store_portal.schema_migrations ORDER BY filename',
  );
  const appliedMigrations = new Set(appliedResult.rows.map((row) => row.filename));
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((filename) => filename.endsWith('.sql'))
    .sort();

  for (const filename of migrationFiles) {
    if (appliedMigrations.has(filename)) continue;

    const migrationSql = await readFile(path.join(migrationsDirectory, filename), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(migrationSql);
      await client.query('INSERT INTO store_portal.schema_migrations (filename) VALUES ($1)', [
        filename,
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`PostgreSQL migration ${filename} failed`, { cause: error });
    } finally {
      client.release();
    }
  }
}
