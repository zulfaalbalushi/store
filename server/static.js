import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { notFound } from './http/errors.js';
import { staticSecurityHeaders } from './http/responses.js';

const PUBLIC_DIRECTORIES = new Set(['css', 'images', 'js', 'pages']);
const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

function resolvePublicFile(publicRoot, requestPath) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    throw notFound();
  }

  if (decodedPath === '/') {
    return path.join(publicRoot, 'index.html');
  }

  const segments = decodedPath.split('/').filter(Boolean);
  const publicDirectory = segments[0];

  if (
    segments.length < 2 ||
    !PUBLIC_DIRECTORIES.has(publicDirectory) ||
    segments.some((segment) => segment === '.' || segment === '..' || segment.includes('\0'))
  ) {
    throw notFound();
  }

  const filePath = path.resolve(publicRoot, ...segments);
  const allowedRoot = path.resolve(publicRoot, publicDirectory);

  if (!filePath.startsWith(`${allowedRoot}${path.sep}`)) {
    throw notFound();
  }

  return filePath;
}

export async function serveStaticFile(request, response, publicRoot) {
  const requestUrl = new URL(request.url, 'http://localhost');
  const filePath = resolvePublicFile(publicRoot, requestUrl.pathname);
  let fileStats;

  try {
    fileStats = await stat(filePath);
  } catch {
    throw notFound();
  }

  if (!fileStats.isFile()) {
    throw notFound();
  }

  const contentType = CONTENT_TYPES.get(path.extname(filePath).toLowerCase());

  if (!contentType) {
    throw notFound();
  }

  const body = request.method === 'HEAD' ? null : await readFile(filePath);
  response.writeHead(200, staticSecurityHeaders(contentType, fileStats.size));
  response.end(body);
}
