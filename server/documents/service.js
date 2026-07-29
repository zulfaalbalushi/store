import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { notFound, serviceUnavailable, validationError } from '../http/errors.js';
import { requireDocumentStorage } from '../storage/supabase.js';

export const MAXIMUM_DOCUMENT_BYTES = 5 * 1024 * 1024;

const DOCUMENT_TYPES = new Set([
  'identity_document',
  'business_registration',
  'food_safety_certificate',
  'other',
]);
const MIME_EXTENSIONS = new Map([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
]);

function toDocumentResponse(document) {
  return {
    id: document.id,
    documentType: document.document_type,
    originalName: document.original_name,
    mimeType: document.mime_type,
    sizeBytes: document.size_bytes,
    reviewStatus: document.review_status,
    createdAt: document.created_at,
  };
}

function fileSignatureMatches(contents, mimeType) {
  if (mimeType === 'application/pdf') {
    return contents.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  if (mimeType === 'image/png') {
    return contents.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === 'image/jpeg') {
    return (
      contents.length >= 3 && contents[0] === 0xff && contents[1] === 0xd8 && contents[2] === 0xff
    );
  }
  return false;
}

function validateUpload({ documentType, originalName, mimeType, contents }) {
  const errors = {};
  const normalizedType = typeof documentType === 'string' ? documentType.trim() : '';
  const normalizedMimeType =
    typeof mimeType === 'string' ? mimeType.split(';', 1)[0].trim().toLowerCase() : '';
  let normalizedName = '';

  try {
    normalizedName = decodeURIComponent(originalName || '').trim();
  } catch {
    errors.file = 'The filename is invalid.';
  }

  normalizedName = path.basename(normalizedName).replaceAll(/[\u0000-\u001f\u007f]/g, '');

  if (!DOCUMENT_TYPES.has(normalizedType)) {
    errors.documentType = 'Choose a valid document type.';
  }
  if (!normalizedName || normalizedName.length > 255) {
    errors.file = 'The filename must contain no more than 255 characters.';
  }
  if (!MIME_EXTENSIONS.has(normalizedMimeType)) {
    errors.file = 'Upload a PDF, JPEG, or PNG file.';
  } else if (!fileSignatureMatches(contents, normalizedMimeType)) {
    errors.file = 'The file contents do not match its declared file type.';
  }

  if (Object.keys(errors).length > 0) throw validationError(errors);

  return {
    documentType: normalizedType,
    extension: MIME_EXTENSIONS.get(normalizedMimeType),
    mimeType: normalizedMimeType,
    originalName: normalizedName,
  };
}

export async function listOwnedDocuments(database, session) {
  const documents = await database.all(
    `SELECT id, document_type, original_name, mime_type, size_bytes, review_status, created_at
     FROM business_documents
     WHERE business_id = ?
     ORDER BY created_at DESC, id DESC`,
    session.business_id,
  );

  return documents.map(toDocumentResponse);
}

export async function uploadOwnedDocument(
  database,
  storage,
  session,
  { documentType, originalName, mimeType, contents },
) {
  const activeStorage = requireDocumentStorage(storage);
  const values = validateUpload({ documentType, originalName, mimeType, contents });
  const storageKey = `${session.business_id}/${randomUUID()}.${values.extension}`;

  try {
    await activeStorage.upload(storageKey, contents, values.mimeType);
  } catch {
    throw serviceUnavailable('The document could not be uploaded. Please try again.');
  }

  try {
    const documentId = await database.transaction(async (transaction) => {
      const id = await transaction.insert(
        `INSERT INTO business_documents
          (business_id, document_type, storage_key, original_name, mime_type, size_bytes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        session.business_id,
        values.documentType,
        storageKey,
        values.originalName,
        values.mimeType,
        contents.length,
      );

      await transaction.run(
        `INSERT INTO audit_events
          (business_id, actor_user_id, action, resource_type, resource_id, metadata_json)
         VALUES (?, ?, 'business_document.uploaded', 'business_document', ?, ?)`,
        session.business_id,
        session.user_id,
        id,
        JSON.stringify({
          documentType: values.documentType,
          mimeType: values.mimeType,
          sizeBytes: contents.length,
        }),
      );
      return id;
    });

    const document = await database.get(
      `SELECT id, document_type, original_name, mime_type, size_bytes, review_status, created_at
       FROM business_documents
       WHERE id = ? AND business_id = ?`,
      documentId,
      session.business_id,
    );
    return toDocumentResponse(document);
  } catch (error) {
    try {
      await activeStorage.remove(storageKey);
    } catch {
      // The unique object key prevents exposing another Store's content if cleanup later fails.
    }
    throw error;
  }
}

export async function downloadOwnedDocument(database, storage, session, documentId) {
  const document = await database.get(
    `SELECT id, storage_key, original_name, mime_type
     FROM business_documents
     WHERE id = ? AND business_id = ?`,
    documentId,
    session.business_id,
  );

  if (!document) throw notFound('The document was not found.');

  try {
    const contents = await requireDocumentStorage(storage).download(document.storage_key);
    return {
      contents,
      mimeType: document.mime_type,
      originalName: document.original_name,
    };
  } catch (error) {
    if (error.name === 'HttpError') throw error;
    throw serviceUnavailable('The document could not be downloaded. Please try again.');
  }
}
