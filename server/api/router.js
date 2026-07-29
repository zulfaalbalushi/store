import { signInStoreOwner, registerStoreOwner } from '../auth/service.js';
import { changeOwnedPassword, getOwnedAccount, updateOwnedAccount } from '../account/service.js';
import { createRateLimiter } from '../auth/rate-limit.js';
import {
  deleteSession,
  expiredSessionCookie,
  requireCsrf,
  requireStoreSession,
  sessionCookie,
} from '../auth/session.js';
import { getOwnedBusiness, submitOwnedBusiness, updateOwnedBusiness } from '../business/service.js';
import {
  downloadOwnedDocument,
  listOwnedDocuments,
  MAXIMUM_DOCUMENT_BYTES,
  uploadOwnedDocument,
} from '../documents/service.js';
import { readBinaryBody, readJsonBody } from '../http/body.js';
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
import { getOrder, listOrders, transitionOrder } from '../orders/service.js';

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

function downloadFilenameHeader(filename) {
  const fallback = filename.replaceAll(/[^\w.-]/g, '_') || 'document';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function createApiRouter({ config, database, documentStorage = null }) {
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
      const session = await requireStoreSession(database, request, config.sessionSecret);

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
      const session = await requireStoreSession(database, request, config.sessionSecret);
      requireCsrf(request, session);
      await deleteSession(database, session.session_id);

      sendSuccess(response, { signedOut: true }, 200, {
        'Set-Cookie': expiredSessionCookie(isProduction),
      });
      return true;
    }

    if (requestUrl.pathname === '/api/v1/store/account') {
      const session = await requireStoreSession(database, request, config.sessionSecret);

      if (request.method === 'GET') {
        sendSuccess(response, { account: await getOwnedAccount(database, session) });
        return true;
      }

      if (request.method === 'PUT') {
        requireCsrf(request, session);
        const input = await readJsonBody(request);
        sendSuccess(response, { account: await updateOwnedAccount(database, session, input) });
        return true;
      }

      throw methodNotAllowed();
    }

    if (requestUrl.pathname === '/api/v1/store/account/password') {
      requireMethod(request, 'POST');
      const session = await requireStoreSession(database, request, config.sessionSecret);
      requireCsrf(request, session);
      authenticationRateLimiter.check(request, 'store-password-change');
      const input = await readJsonBody(request);
      sendSuccess(response, await changeOwnedPassword(database, session, input));
      return true;
    }

    if (requestUrl.pathname === '/api/v1/store/business') {
      const session = await requireStoreSession(database, request, config.sessionSecret);

      if (request.method === 'GET') {
        sendSuccess(response, { business: await getOwnedBusiness(database, session) });
        return true;
      }

      if (request.method === 'PUT') {
        requireCsrf(request, session);
        const input = await readJsonBody(request);
        sendSuccess(response, { business: await updateOwnedBusiness(database, session, input) });
        return true;
      }

      throw methodNotAllowed();
    }

    if (requestUrl.pathname === '/api/v1/store/business/submit') {
      requireMethod(request, 'POST');
      const session = await requireStoreSession(database, request, config.sessionSecret);
      requireCsrf(request, session);
      sendSuccess(response, { business: await submitOwnedBusiness(database, session) });
      return true;
    }

    if (requestUrl.pathname === '/api/v1/store/documents') {
      const session = await requireStoreSession(database, request, config.sessionSecret);

      if (request.method === 'GET') {
        sendSuccess(response, { documents: await listOwnedDocuments(database, session) });
        return true;
      }

      if (request.method === 'POST') {
        requireCsrf(request, session);
        const contents = await readBinaryBody(request, MAXIMUM_DOCUMENT_BYTES);
        const document = await uploadOwnedDocument(database, documentStorage, session, {
          contents,
          documentType: request.headers['x-document-type'],
          mimeType: request.headers['content-type'],
          originalName: request.headers['x-file-name'],
        });
        sendSuccess(response, { document }, 201);
        return true;
      }

      throw methodNotAllowed();
    }

    const documentContentMatch = requestUrl.pathname.match(
      /^\/api\/v1\/store\/documents\/(\d+)\/content$/,
    );
    if (documentContentMatch) {
      requireMethod(request, 'GET');
      const session = await requireStoreSession(database, request, config.sessionSecret);
      const document = await downloadOwnedDocument(
        database,
        documentStorage,
        session,
        documentContentMatch[1],
      );

      response.writeHead(200, {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': downloadFilenameHeader(document.originalName),
        'Content-Length': document.contents.length,
        'Content-Type': document.mimeType,
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(document.contents);
      return true;
    }

    if (requestUrl.pathname === '/api/v1/store/categories') {
      const session = await requireStoreSession(database, request, config.sessionSecret);

      if (request.method === 'GET') {
        sendSuccess(response, { categories: await listCategories(database, session) });
        return true;
      }

      if (request.method === 'POST') {
        requireCsrf(request, session);
        const input = await readJsonBody(request);
        sendSuccess(response, { category: await createCategory(database, session, input) }, 201);
        return true;
      }

      throw methodNotAllowed();
    }

    const categoryMatch = requestUrl.pathname.match(/^\/api\/v1\/store\/categories\/(\d+)$/);
    if (categoryMatch) {
      const session = await requireStoreSession(database, request, config.sessionSecret);
      requireCsrf(request, session);

      if (request.method === 'PUT') {
        const input = await readJsonBody(request);
        sendSuccess(response, {
          category: await updateCategory(database, session, categoryMatch[1], input),
        });
        return true;
      }

      if (request.method === 'DELETE') {
        sendSuccess(response, {
          result: await deleteCategory(database, session, categoryMatch[1]),
        });
        return true;
      }

      throw methodNotAllowed();
    }

    if (requestUrl.pathname === '/api/v1/store/dishes') {
      const session = await requireStoreSession(database, request, config.sessionSecret);

      if (request.method === 'GET') {
        sendSuccess(response, await listDishes(database, session, requestUrl.searchParams));
        return true;
      }

      if (request.method === 'POST') {
        requireCsrf(request, session);
        const input = await readJsonBody(request);
        sendSuccess(response, { dish: await createDish(database, session, input) }, 201);
        return true;
      }

      throw methodNotAllowed();
    }

    const archiveMatch = requestUrl.pathname.match(/^\/api\/v1\/store\/dishes\/(\d+)\/archive$/);
    if (archiveMatch) {
      requireMethod(request, 'POST');
      const session = await requireStoreSession(database, request, config.sessionSecret);
      requireCsrf(request, session);
      sendSuccess(response, { dish: await archiveDish(database, session, archiveMatch[1]) });
      return true;
    }

    const dishMatch = requestUrl.pathname.match(/^\/api\/v1\/store\/dishes\/(\d+)$/);
    if (dishMatch) {
      const session = await requireStoreSession(database, request, config.sessionSecret);

      if (request.method === 'GET') {
        sendSuccess(response, { dish: await getDish(database, session, dishMatch[1]) });
        return true;
      }

      if (request.method === 'PUT') {
        requireCsrf(request, session);
        const input = await readJsonBody(request);
        sendSuccess(response, { dish: await updateDish(database, session, dishMatch[1], input) });
        return true;
      }

      throw methodNotAllowed();
    }

    if (requestUrl.pathname === '/api/v1/store/orders') {
      requireMethod(request, 'GET');
      const session = await requireStoreSession(database, request, config.sessionSecret);
      sendSuccess(response, await listOrders(database, session, requestUrl.searchParams));
      return true;
    }

    const orderStatusMatch = requestUrl.pathname.match(/^\/api\/v1\/store\/orders\/(\d+)\/status$/);
    if (orderStatusMatch) {
      requireMethod(request, 'POST');
      const session = await requireStoreSession(database, request, config.sessionSecret);
      requireCsrf(request, session);
      const input = await readJsonBody(request);
      sendSuccess(response, await transitionOrder(database, session, orderStatusMatch[1], input));
      return true;
    }

    const orderMatch = requestUrl.pathname.match(/^\/api\/v1\/store\/orders\/(\d+)$/);
    if (orderMatch) {
      requireMethod(request, 'GET');
      const session = await requireStoreSession(database, request, config.sessionSecret);
      sendSuccess(response, { order: await getOrder(database, session, orderMatch[1]) });
      return true;
    }

    return false;
  };
}
