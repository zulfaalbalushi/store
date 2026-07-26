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
  assert.match(config.databasePath, /data[/\\]test\.sqlite$/);
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
