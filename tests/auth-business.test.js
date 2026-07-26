import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createApiRouter } from '../server/api/router.js';
import { createRequestHandler } from '../server/app.js';
import { createSession } from '../server/auth/session.js';
import { getOwnedBusiness, updateOwnedBusiness } from '../server/business/service.js';
import { openDatabase } from '../server/database/connection.js';

const TEST_CONFIG = {
  environment: 'test',
  sessionSecret: 'integration-test-secret-that-is-long-enough',
};

function performRequest(handler, url, options = {}) {
  return new Promise((resolve, reject) => {
    const requestBody =
      options.body === undefined ? [] : [Buffer.from(JSON.stringify(options.body))];
    const request = Readable.from(requestBody);
    request.method = options.method || 'GET';
    request.url = url;
    request.headers = {
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...options.headers,
    };

    const headers = {};
    const response = {
      writeHead(status, responseHeaders) {
        this.status = status;
        Object.assign(headers, responseHeaders);
      },
      end(body) {
        resolve({
          body: body ? body.toString() : '',
          headers,
          status: this.status,
        });
      },
    };

    Promise.resolve(handler(request, response)).catch(reject);
  });
}

function json(response) {
  return JSON.parse(response.body);
}

function cookieFrom(response) {
  return response.headers['Set-Cookie'].split(';', 1)[0];
}

function completeBusiness(overrides = {}) {
  return {
    name: 'Bait Al Shuwa',
    description: 'Traditional Omani food prepared at home.',
    contactEmail: 'owner@example.com',
    phone: '+968 9000 0000',
    addressLine: 'House 10, Al Hail',
    governorate: 'Muscat',
    wilayat: 'Seeb',
    serviceAreas: ['Al Hail', 'Mawaleh'],
    isTemporarilyClosed: false,
    closureNote: '',
    hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      isClosed: dayOfWeek === 5,
      opensAt: '08:00',
      closesAt: '18:00',
    })),
    ...overrides,
  };
}

async function testApplication() {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'baytna-api-'));
  const database = await openDatabase(path.join(temporaryDirectory, 'test.sqlite'));
  const apiRouter = createApiRouter({ config: TEST_CONFIG, database });
  const handler = createRequestHandler({
    apiRouter,
    healthCheck: () => database.checkHealth(),
    logger: { error() {} },
  });

  return {
    database,
    handler,
    async close() {
      database.close();
      await rm(temporaryDirectory, { recursive: true });
    },
  };
}

test('Store registration creates a hashed account, business, and secure session', async () => {
  const application = await testApplication();

  try {
    const response = await performRequest(application.handler, '/api/v1/auth/store/register', {
      method: 'POST',
      body: {
        fullName: 'Aisha Al Balushi',
        businessName: 'Bait Al Shuwa',
        email: 'OWNER@Example.com',
        password: 'strong-password',
      },
    });
    const payload = json(response);

    assert.equal(response.status, 201);
    assert.match(response.headers['Set-Cookie'], /HttpOnly/);
    assert.match(response.headers['Set-Cookie'], /SameSite=Lax/);
    assert.equal(payload.data.account.email, 'owner@example.com');
    assert.equal(payload.data.account.businessName, 'Bait Al Shuwa');
    assert.ok(payload.data.csrfToken);

    const storedUser = application.database.get(
      'SELECT email, password_hash FROM users WHERE email = ?',
      'owner@example.com',
    );
    assert.equal(storedUser.email, 'owner@example.com');
    assert.notEqual(storedUser.password_hash, 'strong-password');
    assert.match(storedUser.password_hash, /^\$argon2id\$/);

    const hours = application.database.get(
      'SELECT COUNT(*) AS count FROM business_hours WHERE business_id = ?',
      payload.data.account.businessId,
    );
    assert.equal(hours.count, 7);
  } finally {
    await application.close();
  }
});

test('My Business persists owner-scoped updates and requires CSRF', async () => {
  const application = await testApplication();

  try {
    const registration = await performRequest(application.handler, '/api/v1/auth/store/register', {
      method: 'POST',
      body: {
        fullName: 'Aisha Al Balushi',
        businessName: 'Bait Al Shuwa',
        email: 'owner@example.com',
        password: 'strong-password',
      },
    });
    const registrationPayload = json(registration);
    const cookie = cookieFrom(registration);

    const rejectedUpdate = await performRequest(application.handler, '/api/v1/store/business', {
      method: 'PUT',
      headers: { cookie },
      body: completeBusiness(),
    });
    assert.equal(rejectedUpdate.status, 403);
    assert.equal(json(rejectedUpdate).error.code, 'FORBIDDEN');

    const update = await performRequest(application.handler, '/api/v1/store/business', {
      method: 'PUT',
      headers: {
        cookie,
        'x-csrf-token': registrationPayload.data.csrfToken,
      },
      body: completeBusiness({ applicationStatus: 'approved' }),
    });
    const updatedBusiness = json(update).data.business;

    assert.equal(update.status, 200);
    assert.equal(updatedBusiness.phone, '+968 9000 0000');
    assert.deepEqual(updatedBusiness.serviceAreas, ['Al Hail', 'Mawaleh']);
    assert.equal(updatedBusiness.applicationStatus, 'draft');
    assert.equal(updatedBusiness.completeness.isComplete, true);

    const persisted = await performRequest(application.handler, '/api/v1/store/business', {
      headers: { cookie },
    });
    assert.equal(json(persisted).data.business.description, completeBusiness().description);

    const submission = await performRequest(application.handler, '/api/v1/store/business/submit', {
      method: 'POST',
      headers: {
        cookie,
        'x-csrf-token': registrationPayload.data.csrfToken,
      },
    });
    assert.equal(submission.status, 200);
    assert.equal(json(submission).data.business.applicationStatus, 'pending');

    const repeatedSubmission = await performRequest(
      application.handler,
      '/api/v1/store/business/submit',
      {
        method: 'POST',
        headers: {
          cookie,
          'x-csrf-token': registrationPayload.data.csrfToken,
        },
      },
    );
    assert.equal(repeatedSubmission.status, 409);
  } finally {
    await application.close();
  }
});

test('Store authentication persists in a cookie and rejects duplicate accounts', async () => {
  const application = await testApplication();

  try {
    const account = {
      fullName: 'Aisha Al Balushi',
      businessName: 'Bait Al Shuwa',
      email: 'owner@example.com',
      password: 'strong-password',
    };
    await performRequest(application.handler, '/api/v1/auth/store/register', {
      method: 'POST',
      body: account,
    });

    const duplicate = await performRequest(application.handler, '/api/v1/auth/store/register', {
      method: 'POST',
      body: account,
    });
    assert.equal(duplicate.status, 409);

    const signIn = await performRequest(application.handler, '/api/v1/auth/store/sign-in', {
      method: 'POST',
      body: { email: account.email, password: account.password },
    });
    const cookie = cookieFrom(signIn);
    assert.equal(signIn.status, 200);

    const session = await performRequest(application.handler, '/api/v1/auth/session', {
      headers: { cookie },
    });
    assert.equal(session.status, 200);
    assert.equal(json(session).data.account.businessName, account.businessName);

    const signOut = await performRequest(application.handler, '/api/v1/auth/sign-out', {
      method: 'POST',
      headers: {
        cookie,
        'x-csrf-token': json(session).data.csrfToken,
      },
    });
    assert.equal(signOut.status, 200);
    assert.match(signOut.headers['Set-Cookie'], /Max-Age=0/);

    const expiredSession = await performRequest(application.handler, '/api/v1/auth/session', {
      headers: { cookie },
    });
    assert.equal(expiredSession.status, 401);

    const wrongPassword = await performRequest(application.handler, '/api/v1/auth/store/sign-in', {
      method: 'POST',
      body: { email: account.email, password: 'incorrect-password' },
    });
    assert.equal(wrongPassword.status, 401);
    assert.equal(json(wrongPassword).error.message, 'Email or password is incorrect.');
  } finally {
    await application.close();
  }
});

test('ownership checks reject a mismatched owner and business pair', async () => {
  const application = await testApplication();

  try {
    const first = await performRequest(application.handler, '/api/v1/auth/store/register', {
      method: 'POST',
      body: {
        fullName: 'First Owner',
        businessName: 'First Store',
        email: 'first@example.com',
        password: 'strong-password',
      },
    });
    const second = await performRequest(application.handler, '/api/v1/auth/store/register', {
      method: 'POST',
      body: {
        fullName: 'Second Owner',
        businessName: 'Second Store',
        email: 'second@example.com',
        password: 'strong-password',
      },
    });

    assert.throws(
      () =>
        getOwnedBusiness(application.database, {
          business_id: json(second).data.account.businessId,
          user_id: json(first).data.account.userId,
        }),
      (error) => error.status === 404,
    );

    assert.throws(
      () =>
        updateOwnedBusiness(
          application.database,
          {
            business_id: json(second).data.account.businessId,
            user_id: json(first).data.account.userId,
          },
          completeBusiness(),
        ),
      (error) => error.status === 404,
    );
  } finally {
    await application.close();
  }
});

test('Customer sessions cannot access Store resources', async () => {
  const application = await testApplication();

  try {
    const user = application.database.run(
      `INSERT INTO users (role, email, password_hash, full_name)
       VALUES ('customer', 'customer@example.com', 'not-used-in-this-test', 'Customer User')`,
    );
    const session = createSession(
      application.database,
      Number(user.lastInsertRowid),
      TEST_CONFIG.sessionSecret,
    );

    const response = await performRequest(application.handler, '/api/v1/store/business', {
      headers: { cookie: `baytna_session=${session.token}` },
    });

    assert.equal(response.status, 401);
    assert.equal(json(response).error.code, 'UNAUTHORIZED');
  } finally {
    await application.close();
  }
});
