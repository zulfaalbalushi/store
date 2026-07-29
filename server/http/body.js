import { HttpError } from './errors.js';

const DEFAULT_MAXIMUM_BYTES = 32 * 1024;

export async function readJsonBody(request, maximumBytes = DEFAULT_MAXIMUM_BYTES) {
  const contentType = request.headers['content-type'] || '';

  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
  }

  const chunks = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    receivedBytes += chunk.length;

    if (receivedBytes > maximumBytes) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
    }

    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'The request body must contain valid JSON.');
  }
}

export async function readBinaryBody(request, maximumBytes) {
  const contentLength = Number(request.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The uploaded file is too large.');
  }

  const chunks = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > maximumBytes) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The uploaded file is too large.');
    }
    chunks.push(chunk);
  }

  if (receivedBytes === 0) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Choose a file to upload.', {
      file: 'Choose a file to upload.',
    });
  }

  return Buffer.concat(chunks);
}
