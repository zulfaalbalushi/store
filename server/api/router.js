import { signInStoreOwner, registerStoreOwner } from '../auth/service.js';
import { createRateLimiter } from '../auth/rate-limit.js';
import {
  deleteSession,
  expiredSessionCookie,
  requireCsrf,
  requireStoreSession,
  sessionCookie,
} from '../auth/session.js';
import { getOwnedBusiness, submitOwnedBusiness, updateOwnedBusiness } from '../business/service.js';
import { readJsonBody } from '../http/body.js';
import { methodNotAllowed } from '../http/errors.js';
import { sendSuccess } from '../http/responses.js';
import {
  archiveDish,
  createCategory,
  createDish,
  deleteCategory,
  getDish,
  listCategories,
  listDishes,
  updateCategory,
  updateDish,
} from '../menu/service.js';

function requireMethod(request, method) {
  if (request.method !== method) throw methodNotAllowed();
}

function accountPayload(result) {
  return {
    account: result.account,
    csrfToken: result.session.csrfToken,
    expiresAt: result.session.expiresAt,
  };
}

export function createApiRouter({ config, database }) {
  const isProduction = config.environment === 'production';
  const authenticationRateLimiter = createRateLimiter();

  return async function routeApiRequest(request, response, requestUrl) {
    if (requestUrl.pathname === '/api/v1/auth/store/register') {
      requireMethod(request, 'POST');
      authenticationRateLimiter.check(request, 'store-register');
      const input = await readJsonBody(request);
      const result = await registerStoreOwner(database, input, config.sessionSecret);

      sendSuccess(response, accountPayload(result), 201, {
        'Set-Cookie': sessionCookie(result.session.token, isProduction),
      });
      return true;
    }

    if (requestUrl.pathname === '/api/v1/auth/store/sign-in') {
      requireMethod(request, 'POST');
      authenticationRateLimiter.check(request, 'store-sign-in');
      const input = await readJsonBody(request);
      const result = await signInStoreOwner(database, input, config.sessionSecret);

      sendSuccess(response, accountPayload(result), 200, {
        'Set-Cookie': sessionCookie(result.session.token, isProduction),
      });
      return true;
    }

    if (requestUrl.pathname === '/api/v1/auth/session') {
      requireMethod(request, 'GET');
      const session = requireStoreSession(database, request, config.sessionSecret);

      sendSuccess(response, {
        account: {
          businessId: session.business_id,
          businessName: session.business_name,
          email: session.email,
          fullName: session.full_name,
          userId: session.user_id,
        },
        csrfToken: session.csrf_token,
        expiresAt: session.expires_at,
      });
      return true;
    }

    if (requestUrl.pathname === '/api/v1/auth/sign-out') {
      requireMethod(request, 'POST');
      const session = requireStoreSession(database, request, config.sessionSecret);
      requireCsrf(request, session);
      deleteSession(database, session.session_id);

      sendSuccess(response, { signedOut: true }, 200, {
        'Set-Cookie': expiredSessionCookie(isProduction),
      });
      return true;
    }

    if (requestUrl.pathname === '/api/v1/store/business') {
      const session = requireStoreSession(database, request, config.sessionSecret);

      if (request.method === 'GET') {
        sendSuccess(response, { business: getOwnedBusiness(database, session) });
        return true;
      }

      if (request.method === 'PUT') {
        requireCsrf(request, session);
        const input = await readJsonBody(request);
        sendSuccess(response, { business: updateOwnedBusiness(database, session, input) });
        return true;
      }

      throw methodNotAllowed();
    }

    if (requestUrl.pathname === '/api/v1/store/business/submit') {
      requireMethod(request, 'POST');
      const session = requireStoreSession(database, request, config.sessionSecret);
      requireCsrf(request, session);
      sendSuccess(response, { business: submitOwnedBusiness(database, session) });
      return true;
    }

    if (requestUrl.pathname === '/api/v1/store/categories') {
      const session = requireStoreSession(database, request, config.sessionSecret);

      if (request.method === 'GET') {
        sendSuccess(response, { categories: listCategories(database, session) });
        return true;
      }

      if (request.method === 'POST') {
        requireCsrf(request, session);
        const input = await readJsonBody(request);
        sendSuccess(response, { category: createCategory(database, session, input) }, 201);
        return true;
      }

      throw methodNotAllowed();
    }

    const categoryMatch = requestUrl.pathname.match(/^\/api\/v1\/store\/categories\/(\d+)$/);
    if (categoryMatch) {
      const session = requireStoreSession(database, request, config.sessionSecret);
      requireCsrf(request, session);

      if (request.method === 'PUT') {
        const input = await readJsonBody(request);
        sendSuccess(response, {
          category: updateCategory(database, session, categoryMatch[1], input),
        });
        return true;
      }

      if (request.method === 'DELETE') {
        sendSuccess(response, {
          result: deleteCategory(database, session, categoryMatch[1]),
        });
        return true;
      }

      throw methodNotAllowed();
    }

    if (requestUrl.pathname === '/api/v1/store/dishes') {
      const session = requireStoreSession(database, request, config.sessionSecret);

      if (request.method === 'GET') {
        sendSuccess(response, listDishes(database, session, requestUrl.searchParams));
        return true;
      }

      if (request.method === 'POST') {
        requireCsrf(request, session);
        const input = await readJsonBody(request);
        sendSuccess(response, { dish: createDish(database, session, input) }, 201);
        return true;
      }

      throw methodNotAllowed();
    }

    const archiveMatch = requestUrl.pathname.match(/^\/api\/v1\/store\/dishes\/(\d+)\/archive$/);
    if (archiveMatch) {
      requireMethod(request, 'POST');
      const session = requireStoreSession(database, request, config.sessionSecret);
      requireCsrf(request, session);
      sendSuccess(response, { dish: archiveDish(database, session, archiveMatch[1]) });
      return true;
    }

    const dishMatch = requestUrl.pathname.match(/^\/api\/v1\/store\/dishes\/(\d+)$/);
    if (dishMatch) {
      const session = requireStoreSession(database, request, config.sessionSecret);

      if (request.method === 'GET') {
        sendSuccess(response, { dish: getDish(database, session, dishMatch[1]) });
        return true;
      }

      if (request.method === 'PUT') {
        requireCsrf(request, session);
        const input = await readJsonBody(request);
        sendSuccess(response, { dish: updateDish(database, session, dishMatch[1], input) });
        return true;
      }

      throw methodNotAllowed();
    }

    return false;
  };
}
