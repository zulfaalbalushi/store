import { serviceUnavailable } from '../http/errors.js';

function encodeStoragePath(value) {
  return value
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function storageError(response, operation) {
  let detail = '';

  try {
    const payload = await response.json();
    detail = payload.message || payload.error || '';
  } catch {
    // Supabase may return an empty or non-JSON response during an outage.
  }

  const error = new Error(`Supabase Storage could not ${operation}${detail ? `: ${detail}` : '.'}`);
  error.name = 'SupabaseStorageError';
  error.status = response.status;
  return error;
}

export function createSupabaseStorage(config, fetchImplementation = fetch) {
  if (!config.supabaseUrl || !config.supabaseSecretKey || !config.supabaseDocumentsBucket) {
    return null;
  }

  const baseUrl = `${config.supabaseUrl}/storage/v1`;
  const bucket = config.supabaseDocumentsBucket;
  const authorizationHeaders = {
    apikey: config.supabaseSecretKey,
  };
  if (!config.supabaseSecretKey.startsWith('sb_secret_')) {
    authorizationHeaders.Authorization = `Bearer ${config.supabaseSecretKey}`;
  }

  return Object.freeze({
    async download(storageKey) {
      const response = await fetchImplementation(
        `${baseUrl}/object/authenticated/${encodeURIComponent(bucket)}/${encodeStoragePath(storageKey)}`,
        { headers: authorizationHeaders },
      );

      if (!response.ok) throw await storageError(response, 'download the document');
      return Buffer.from(await response.arrayBuffer());
    },

    async remove(storageKey) {
      const response = await fetchImplementation(
        `${baseUrl}/object/${encodeURIComponent(bucket)}/${encodeStoragePath(storageKey)}`,
        {
          method: 'DELETE',
          headers: authorizationHeaders,
        },
      );

      if (!response.ok && response.status !== 404) {
        throw await storageError(response, 'remove the document');
      }
    },

    async upload(storageKey, contents, mimeType) {
      const response = await fetchImplementation(
        `${baseUrl}/object/${encodeURIComponent(bucket)}/${encodeStoragePath(storageKey)}`,
        {
          method: 'POST',
          headers: {
            ...authorizationHeaders,
            'cache-control': 'no-store',
            'content-type': mimeType,
            'x-upsert': 'false',
          },
          body: contents,
        },
      );

      if (!response.ok) throw await storageError(response, 'upload the document');
    },
  });
}

export function requireDocumentStorage(storage) {
  if (!storage) {
    throw serviceUnavailable(
      'Document storage is not configured. Ask the Store administrator to configure Supabase Storage.',
    );
  }

  return storage;
}
