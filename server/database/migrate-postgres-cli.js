import { readFile } from 'node:fs/promises';
import pg from 'pg';

import { runPostgresMigrations } from './postgres-migrate.js';

const { Pool } = pg;
const databaseUrl = process.env.BAYTNA_MIGRATION_DATABASE_URL || process.env.BAYTNA_DATABASE_URL;

if (!databaseUrl) {
  console.error(
    'Set BAYTNA_MIGRATION_DATABASE_URL or BAYTNA_DATABASE_URL before running PostgreSQL migrations.',
  );
  process.exitCode = 1;
} else {
  const { hostname } = new URL(databaseUrl);
  const databaseCaPath = process.env.BAYTNA_DATABASE_CA_PATH;
  const ssl = ['localhost', '127.0.0.1', '::1'].includes(hostname)
    ? false
    : {
        ca: databaseCaPath ? await readFile(databaseCaPath, 'utf8') : undefined,
        rejectUnauthorized: true,
      };
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    options: '-c search_path=store_portal,public',
    ssl,
  });

  try {
    await runPostgresMigrations(pool);
    console.log('Baytna Store PostgreSQL migrations completed.');
  } catch (error) {
    console.error('Unable to migrate the Baytna Store PostgreSQL schema', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
