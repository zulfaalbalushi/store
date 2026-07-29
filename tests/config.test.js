import assert from 'node:assert/strict';
import test from 'node:test';

import { ConfigurationError, loadConfig } from '../server/config.js';

const VALID_ENVIRONMENT = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '0',
  BAYTNA_DATABASE_PATH: './data/test.sqlite',
  BAYTNA_SESSION_SECRET: 'a-development-secret-with-32-characters',
};

test('loadConfig normalizes valid environment configuration', () => {
  const config = loadConfig(VALID_ENVIRONMENT);

  assert.equal(config.environment, 'test');
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 0);
  assert.equal(config.databaseType, 'sqlite');
  assert.match(config.databasePath, /data[/\\]test\.sqlite$/);
});

test('loadConfig accepts a PostgreSQL connection URL instead of a SQLite path', () => {
  const config = loadConfig({
    ...VALID_ENVIRONMENT,
    BAYTNA_DATABASE_CA_PATH: './certificates/supabase-ca.crt',
    BAYTNA_DATABASE_PATH: undefined,
    BAYTNA_DATABASE_URL: 'postgresql://store:secret@localhost:5432/baytna',
  });

  assert.equal(config.databasePath, null);
  assert.equal(config.databaseType, 'postgresql');
  assert.equal(config.databaseUrl, 'postgresql://store:secret@localhost:5432/baytna');
  assert.match(config.databaseCaPath, /certificates[/\\]supabase-ca\.crt$/);
});

test('loadConfig accepts a complete Supabase Storage configuration', () => {
  const config = loadConfig({
    ...VALID_ENVIRONMENT,
    BAYTNA_SUPABASE_URL: 'https://project-ref.supabase.co/',
    BAYTNA_SUPABASE_SECRET_KEY: 'sb_secret_server-only-key',
    BAYTNA_SUPABASE_DOCUMENTS_BUCKET: 'store-documents',
  });

  assert.equal(config.supabaseUrl, 'https://project-ref.supabase.co');
  assert.equal(config.supabaseSecretKey, 'sb_secret_server-only-key');
  assert.equal(config.supabaseDocumentsBucket, 'store-documents');
});

test('loadConfig rejects incomplete Supabase Storage configuration', () => {
  assert.throws(
    () =>
      loadConfig({
        ...VALID_ENVIRONMENT,
        BAYTNA_SUPABASE_URL: 'https://project-ref.supabase.co',
      }),
    (error) =>
      error instanceof ConfigurationError &&
      error.messages.includes(
        'Set BAYTNA_SUPABASE_URL, a Supabase server key, and BAYTNA_SUPABASE_DOCUMENTS_BUCKET together.',
      ),
  );
});

test('loadConfig rejects ambiguous or non-PostgreSQL database configuration', () => {
  assert.throws(
    () =>
      loadConfig({
        ...VALID_ENVIRONMENT,
        BAYTNA_DATABASE_URL: 'https://example.com/not-a-database',
      }),
    (error) => error instanceof ConfigurationError && error.messages.length === 2,
  );
});

test('loadConfig reports all unsafe or missing values', () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: 'invalid',
        PORT: 'not-a-port',
        BAYTNA_SESSION_SECRET: 'short',
      }),
    (error) => {
      assert.ok(error instanceof ConfigurationError);
      assert.equal(error.messages.length, 4);
      return true;
    },
  );
});
