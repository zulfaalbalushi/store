import assert from 'node:assert/strict';
import test from 'node:test';

import { createRequestHandler } from '../server/app.js';

function request(handler, url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const headers = {};
    const response = {
      status: null,
      body: '',
      writeHead(status, responseHeaders) {
        this.status = status;
        Object.assign(headers, responseHeaders);
      },
      end(body) {
        this.body = body ? body.toString() : '';
        resolve({
          status: this.status,
          headers,
          body: this.body,
        });
      },
    };

    Promise.resolve(handler({ method, url }, response)).catch(reject);
  });
}

const silentLogger = {
  error() {},
};

test('health endpoint returns the standard success shape', async () => {
  const handler = createRequestHandler({ logger: silentLogger });
  const response = await request(handler, '/api/v1/health');
  const payload = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.equal(response.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(payload.success, true);
  assert.equal(payload.data.database, 'ok');
  assert.equal(payload.data.service, 'baytna-store-portal');
  assert.equal(payload.data.status, 'ok');
});

test('health endpoint reports an unavailable database safely', async () => {
  const handler = createRequestHandler({
    logger: silentLogger,
    healthCheck: () => false,
  });
  const response = await request(handler, '/api/v1/health');
  const payload = JSON.parse(response.body);

  assert.equal(response.status, 503);
  assert.deepEqual(payload, {
    success: false,
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'The database is not ready.',
    },
  });
});

test('unknown API endpoint returns the standard error shape', async () => {
  const handler = createRequestHandler({ logger: silentLogger });
  const response = await request(handler, '/api/v1/missing');
  const payload = JSON.parse(response.body);

  assert.equal(response.status, 404);
  assert.deepEqual(payload, {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested API endpoint was not found.',
    },
  });
});

test('health endpoint rejects unsupported methods', async () => {
  const handler = createRequestHandler({ logger: silentLogger });
  const response = await request(handler, '/api/v1/health', 'POST');
  const payload = JSON.parse(response.body);

  assert.equal(response.status, 405);
  assert.equal(payload.success, false);
  assert.equal(payload.error.code, 'METHOD_NOT_ALLOWED');
});

test('server safely serves the customer homepage and Store authentication page', async () => {
  const handler = createRequestHandler({ logger: silentLogger });
  const homepageResponse = await request(handler, '/');
  const authenticationResponse = await request(handler, '/pages/store/login.html');

  assert.equal(homepageResponse.status, 200);
  assert.match(homepageResponse.headers['Content-Type'], /^text\/html/);
  assert.match(homepageResponse.body, /Taste the love/);
  assert.equal(authenticationResponse.status, 200);
  assert.match(authenticationResponse.headers['Content-Type'], /^text\/html/);
  assert.match(authenticationResponse.body, /Create account/);
});

test('server serves the Store-owner portal and removes the old admin route', async () => {
  const handler = createRequestHandler({ logger: silentLogger });
  const storeResponse = await request(handler, '/pages/store/dashboard.html');
  const businessResponse = await request(handler, '/pages/store/business.html');
  const menuResponse = await request(handler, '/pages/store/menu.html');
  const ordersResponse = await request(handler, '/pages/store/orders.html');
  const documentsResponse = await request(handler, '/pages/store/documents.html');
  const profileResponse = await request(handler, '/pages/store/profile.html');
  const oldAdminResponse = await request(handler, '/pages/admin/dashboard.html');

  assert.equal(storeResponse.status, 200);
  assert.match(storeResponse.body, /My business/);
  assert.match(storeResponse.body, /\/js\/theme\.js/);
  assert.doesNotMatch(storeResponse.body, /id="dark-mode-toggle"/);
  assert.doesNotMatch(storeResponse.body, />Businesses</);
  assert.equal(businessResponse.status, 200);
  assert.match(businessResponse.body, /Operating hours/);
  assert.doesNotMatch(businessResponse.body, /id="dark-mode-toggle"/);
  assert.equal(menuResponse.status, 200);
  assert.match(menuResponse.body, /Your dishes/);
  assert.doesNotMatch(menuResponse.body, /id="dark-mode-toggle"/);
  assert.equal(ordersResponse.status, 200);
  assert.match(ordersResponse.body, /Your orders/);
  assert.doesNotMatch(ordersResponse.body, /id="dark-mode-toggle"/);
  assert.equal(documentsResponse.status, 200);
  assert.match(documentsResponse.body, /Verification documents/);
  assert.match(documentsResponse.body, /\/js\/documents\.js/);
  assert.equal(profileResponse.status, 200);
  assert.match(profileResponse.body, /Personal profile/);
  assert.match(profileResponse.body, /Dark mode/);
  assert.equal(oldAdminResponse.status, 404);
});

test('server does not expose repository or environment files', async () => {
  const handler = createRequestHandler({ logger: silentLogger });

  for (const unsafePath of ['/README.md', '/.env', '/server/config.js', '/pages/../../.env']) {
    const response = await request(handler, unsafePath);
    assert.equal(response.status, 404, unsafePath);
  }
});
