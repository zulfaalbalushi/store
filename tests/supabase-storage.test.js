import assert from 'node:assert/strict';
import test from 'node:test';

import { createSupabaseStorage } from '../server/storage/supabase.js';

test('Supabase Storage uses the existing private bucket with a modern server key', async () => {
  const calls = [];
  const storage = createSupabaseStorage(
    {
      supabaseUrl: 'https://existing-project.supabase.co',
      supabaseSecretKey: 'sb_secret_server-key',
      supabaseDocumentsBucket: 'store-documents',
    },
    async (url, options = {}) => {
      calls.push({ url, options });
      return new Response(null, { status: 200 });
    },
  );

  await storage.upload('12/folder safe/document.pdf', Buffer.from('%PDF-'), 'application/pdf');
  await storage.remove('12/folder safe/document.pdf');

  assert.equal(
    calls[0].url,
    'https://existing-project.supabase.co/storage/v1/object/store-documents/12/folder%20safe/document.pdf',
  );
  assert.equal(calls[0].options.headers.apikey, 'sb_secret_server-key');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[0].options.headers['x-upsert'], 'false');
  assert.equal(calls[1].options.method, 'DELETE');
});

test('Supabase Storage supports a legacy JWT service-role key for shared projects', async () => {
  let request;
  const storage = createSupabaseStorage(
    {
      supabaseUrl: 'https://existing-project.supabase.co',
      supabaseSecretKey: 'legacy-jwt-service-role-key',
      supabaseDocumentsBucket: 'store-documents',
    },
    async (url, options) => {
      request = { url, options };
      return new Response(Buffer.from('document contents'), { status: 200 });
    },
  );

  const contents = await storage.download('4/document.pdf');

  assert.equal(contents.toString(), 'document contents');
  assert.equal(
    request.url,
    'https://existing-project.supabase.co/storage/v1/object/authenticated/store-documents/4/document.pdf',
  );
  assert.equal(request.options.headers.apikey, 'legacy-jwt-service-role-key');
  assert.equal(request.options.headers.Authorization, 'Bearer legacy-jwt-service-role-key');
});
