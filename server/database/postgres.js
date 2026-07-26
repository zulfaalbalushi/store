import { readFile } from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;

async function sslConfiguration(databaseUrl, databaseCaPath) {
  const { hostname } = new URL(databaseUrl);
  if (['localhost', '127.0.0.1', '::1'].includes(hostname)) return false;

  return {
    ca: databaseCaPath ? await readFile(databaseCaPath, 'utf8') : undefined,
    rejectUnauthorized: true,
  };
}

function postgresParameters(sql) {
  let index = 0;
  return sql.replaceAll('?', () => `$${(index += 1)}`);
}

function createQueryInterface(query) {
  return {
    async all(sql, ...parameters) {
      const result = await query(postgresParameters(sql), parameters);
      return result.rows;
    },
    async checkHealth() {
      const result = await query('SELECT 1 AS healthy');
      return result.rows[0]?.healthy === 1;
    },
    async exec(sql) {
      await query(sql);
    },
    async get(sql, ...parameters) {
      const result = await query(postgresParameters(sql), parameters);
      return result.rows[0];
    },
    async insert(sql, ...parameters) {
      const result = await query(`${postgresParameters(sql)} RETURNING id`, parameters);
      return Number(result.rows[0].id);
    },
    async run(sql, ...parameters) {
      const result = await query(postgresParameters(sql), parameters);
      return { changes: result.rowCount };
    },
  };
}

export async function openPostgresDatabase(databaseUrl, databaseCaPath = null) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    options: '-c search_path=store_portal,public',
    ssl: await sslConfiguration(databaseUrl, databaseCaPath),
  });
  const database = createQueryInterface((sql, parameters) => pool.query(sql, parameters));

  try {
    await database.checkHealth();
    const schema = await database.get("SELECT to_regclass('store_portal.users') AS users_table");
    if (!schema.users_table) {
      throw new Error(
        'The Store PostgreSQL schema is missing. Run npm run db:migrate:postgres first.',
      );
    }
  } catch (error) {
    await pool.end();
    throw error;
  }

  return {
    ...database,
    async transaction(callback) {
      const client = await pool.connect();
      const transactionDatabase = createQueryInterface((sql, parameters) =>
        client.query(sql, parameters),
      );

      try {
        await client.query('BEGIN');
        const result = await callback(transactionDatabase);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
