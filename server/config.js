import path from 'node:path';

const ALLOWED_ENVIRONMENTS = new Set(['development', 'test', 'production']);

export class ConfigurationError extends Error {
  constructor(messages) {
    super(`Invalid environment configuration:\n- ${messages.join('\n- ')}`);
    this.name = 'ConfigurationError';
    this.messages = messages;
  }
}

export function loadConfig(environment = process.env) {
  const errors = [];
  const nodeEnvironment = environment.NODE_ENV || 'development';
  const host = environment.HOST || '127.0.0.1';
  const port = Number(environment.PORT || 8000);
  const databasePath = environment.BAYTNA_DATABASE_PATH;
  const sessionSecret = environment.BAYTNA_SESSION_SECRET;

  if (!ALLOWED_ENVIRONMENTS.has(nodeEnvironment)) {
    errors.push('NODE_ENV must be development, test, or production.');
  }

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    errors.push('PORT must be an integer from 0 to 65535.');
  }

  if (!databasePath) {
    errors.push('BAYTNA_DATABASE_PATH is required.');
  }

  if (!sessionSecret || sessionSecret.length < 32) {
    errors.push('BAYTNA_SESSION_SECRET must contain at least 32 characters.');
  }

  if (errors.length > 0) {
    throw new ConfigurationError(errors);
  }

  return Object.freeze({
    environment: nodeEnvironment,
    host,
    port,
    databasePath: path.resolve(databasePath),
    sessionSecret,
  });
}
