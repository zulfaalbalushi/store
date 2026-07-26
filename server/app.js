import { fileURLToPath } from 'node:url';

import { HttpError, methodNotAllowed, notFound, serviceUnavailable } from './http/errors.js';
import { sendError, sendSuccess } from './http/responses.js';
import { serveStaticFile } from './static.js';

const DEFAULT_PUBLIC_ROOT = fileURLToPath(new URL('../', import.meta.url));

export function createRequestHandler(options = {}) {
  const publicRoot = options.publicRoot || DEFAULT_PUBLIC_ROOT;
  const logger = options.logger || console;
  const healthCheck = options.healthCheck || (() => true);
  const apiRouter = options.apiRouter;

  return async function handleRequest(request, response) {
    try {
      const requestUrl = new URL(request.url, 'http://localhost');

      if (requestUrl.pathname === '/api/v1/health') {
        if (request.method !== 'GET') {
          throw methodNotAllowed();
        }

        const databaseIsHealthy = await healthCheck();

        if (!databaseIsHealthy) {
          throw serviceUnavailable('The database is not ready.');
        }

        sendSuccess(response, {
          database: 'ok',
          service: 'baytna-store-portal',
          status: 'ok',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (requestUrl.pathname.startsWith('/api/')) {
        if (apiRouter && (await apiRouter(request, response, requestUrl))) {
          return;
        }
        throw notFound('The requested API endpoint was not found.');
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        throw methodNotAllowed();
      }

      await serveStaticFile(request, response, publicRoot);
    } catch (error) {
      if (error instanceof HttpError) {
        sendError(response, error);
        return;
      }

      logger.error('Unhandled request error', {
        method: request.method,
        path: request.url,
        error,
      });

      sendError(
        response,
        new HttpError(500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.'),
      );
    }
  };
}
