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
  const databaseUrl = environment.BAYTNA_DATABASE_URL;
  const databaseCaPath = environment.BAYTNA_DATABASE_CA_PATH;
  const sessionSecret = environment.BAYTNA_SESSION_SECRET;
  const supabaseUrl = environment.BAYTNA_SUPABASE_URL;
  const supabaseSecretKey =
    environment.BAYTNA_SUPABASE_SECRET_KEY || environment.BAYTNA_SUPABASE_SERVICE_ROLE_KEY;
  const supabaseDocumentsBucket = environment.BAYTNA_SUPABASE_DOCUMENTS_BUCKET;

  if (!ALLOWED_ENVIRONMENTS.has(nodeEnvironment)) {
    errors.push('NODE_ENV must be development, test, or production.');
  }

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    errors.push('PORT must be an integer from 0 to 65535.');
  }

  if (!databasePath && !databaseUrl) {
    errors.push('BAYTNA_DATABASE_PATH or BAYTNA_DATABASE_URL is required.');
  }

  if (databasePath && databaseUrl) {
    errors.push('Set only one of BAYTNA_DATABASE_PATH or BAYTNA_DATABASE_URL.');
  }

  if (databaseUrl) {
    try {
      const parsedDatabaseUrl = new URL(databaseUrl);
      if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) {
        errors.push('BAYTNA_DATABASE_URL must use the postgres or postgresql protocol.');
      }
    } catch {
      errors.push('BAYTNA_DATABASE_URL must be a valid PostgreSQL connection URL.');
    }
  }

  if (!sessionSecret || sessionSecret.length < 32) {
    errors.push('BAYTNA_SESSION_SECRET must contain at least 32 characters.');
  }

  if (environment.BAYTNA_SUPABASE_SECRET_KEY && environment.BAYTNA_SUPABASE_SERVICE_ROLE_KEY) {
    errors.push('Set only one of BAYTNA_SUPABASE_SECRET_KEY or BAYTNA_SUPABASE_SERVICE_ROLE_KEY.');
  }

  const storageValues = [supabaseUrl, supabaseSecretKey, supabaseDocumentsBucket];
  const configuredStorageValues = storageValues.filter(Boolean).length;

  if (configuredStorageValues > 0 && configuredStorageValues < storageValues.length) {
    errors.push(
      'Set BAYTNA_SUPABASE_URL, a Supabase server key, and BAYTNA_SUPABASE_DOCUMENTS_BUCKET together.',
    );
  }

  if (supabaseUrl) {
    try {
      const parsedSupabaseUrl = new URL(supabaseUrl);
      if (parsedSupabaseUrl.protocol !== 'https:') {
        errors.push('BAYTNA_SUPABASE_URL must use HTTPS.');
      }
    } catch {
      errors.push('BAYTNA_SUPABASE_URL must be a valid URL.');
    }
  }

  if (
    supabaseDocumentsBucket &&
    !/^[a-z0-9][a-z0-9._-]{1,98}[a-z0-9]$/i.test(supabaseDocumentsBucket)
  ) {
    errors.push('BAYTNA_SUPABASE_DOCUMENTS_BUCKET must be a valid bucket name.');
  }

  if (errors.length > 0) {
    throw new ConfigurationError(errors);
  }

  return Object.freeze({
    environment: nodeEnvironment,
    host,
    port,
    databaseCaPath: databaseCaPath ? path.resolve(databaseCaPath) : null,
    databasePath: databasePath ? path.resolve(databasePath) : null,
    databaseUrl: databaseUrl || null,
    databaseType: databaseUrl ? 'postgresql' : 'sqlite',
    sessionSecret,
    supabaseDocumentsBucket: supabaseDocumentsBucket || null,
    supabaseSecretKey: supabaseSecretKey || null,
    supabaseUrl: supabaseUrl ? supabaseUrl.replace(/\/+$/, '') : null,
  });
}
