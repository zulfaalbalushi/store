import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { forbidden, unauthorized } from '../http/errors.js';

export const SESSION_COOKIE_NAME = 'baytna_session';
const SESSION_DURATION_MILLISECONDS = 8 * 60 * 60 * 1000;

function hashSessionToken(token, secret) {
  return createHmac('sha256', secret).update(token).digest('hex');
}

function parseCookies(cookieHeader = '') {
  const cookies = {};

  for (const part of cookieHeader.split(';').map((value) => value.trim())) {
    if (!part) continue;

    const separator = part.indexOf('=');
    const name = separator === -1 ? part : part.slice(0, separator);
    const encodedValue = separator === -1 ? '' : part.slice(separator + 1);

    try {
      cookies[name] = decodeURIComponent(encodedValue);
    } catch {
      cookies[name] = '';
    }
  }

  return cookies;
}

export function createSession(database, userId, secret) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MILLISECONDS).toISOString();

  database.run('DELETE FROM sessions WHERE expires_at <= ?', new Date().toISOString());
  database.run(
    'INSERT INTO sessions (user_id, token_hash, csrf_token, expires_at) VALUES (?, ?, ?, ?)',
    userId,
    hashSessionToken(token, secret),
    csrfToken,
    expiresAt,
  );

  return { csrfToken, expiresAt, token };
}

export function sessionCookie(token, isProduction) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${SESSION_DURATION_MILLISECONDS / 1000}`,
  ];

  if (isProduction) attributes.push('Secure');
  return attributes.join('; ');
}

export function expiredSessionCookie(isProduction) {
  const attributes = [`${SESSION_COOKIE_NAME}=`, 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0'];

  if (isProduction) attributes.push('Secure');
  return attributes.join('; ');
}

export function findSession(database, request, secret) {
  const token = parseCookies(request.headers.cookie)[SESSION_COOKIE_NAME];

  if (!token) return null;

  return (
    database.get(
      `SELECT
        sessions.id AS session_id,
        sessions.csrf_token,
        sessions.expires_at,
        users.id AS user_id,
        users.role,
        users.email,
        users.full_name,
        businesses.id AS business_id,
        businesses.name AS business_name
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      LEFT JOIN businesses ON businesses.owner_user_id = users.id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
      hashSessionToken(token, secret),
      new Date().toISOString(),
    ) || null
  );
}

export function requireStoreSession(database, request, secret) {
  const session = findSession(database, request, secret);

  if (!session || session.role !== 'store_owner' || !session.business_id) {
    throw unauthorized();
  }

  return session;
}

export function requireCsrf(request, session) {
  const providedToken = request.headers['x-csrf-token'];
  const expectedToken = session.csrf_token;

  if (
    typeof providedToken !== 'string' ||
    providedToken.length !== expectedToken.length ||
    !timingSafeEqual(Buffer.from(providedToken), Buffer.from(expectedToken))
  ) {
    throw forbidden('The security token is missing or invalid. Refresh the page and try again.');
  }
}

export function deleteSession(database, sessionId) {
  database.run('DELETE FROM sessions WHERE id = ?', sessionId);
}
