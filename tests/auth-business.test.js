import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createApiRouter } from '../server/api/router.js';
import { getOwnedAccount } from '../server/account/service.js';
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
    const categories = application.database.all(
      'SELECT name FROM categories WHERE business_id = ? ORDER BY name',
      payload.data.account.businessId,
    );
    assert.deepEqual(
      categories.map((category) => category.name),
      ['Appetizers', 'Breads', 'Drinks', 'Main dishes', 'Sweets & Desserts'],
    );
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

test('Profile settings update the owner name and securely change the password', async () => {
  const application = await testApplication();

  try {
    const account = {
      fullName: 'Aisha Al Balushi',
      businessName: 'Bait Al Shuwa',
      email: 'profile@example.com',
      password: 'strong-password',
    };
    const registration = await performRequest(application.handler, '/api/v1/auth/store/register', {
      method: 'POST',
      body: account,
    });
    const registrationPayload = json(registration);
    const cookie = cookieFrom(registration);
    const otherSession = await performRequest(application.handler, '/api/v1/auth/store/sign-in', {
      method: 'POST',
      body: { email: account.email, password: account.password },
    });
    const otherCookie = cookieFrom(otherSession);

    const profile = await performRequest(application.handler, '/api/v1/store/account', {
      headers: { cookie },
    });
    assert.equal(profile.status, 200);
    assert.deepEqual(json(profile).data.account, {
      email: account.email,
      fullName: account.fullName,
      userId: registrationPayload.data.account.userId,
    });

    const missingCsrf = await performRequest(application.handler, '/api/v1/store/account', {
      method: 'PUT',
      headers: { cookie },
      body: { fullName: 'Updated Owner' },
    });
    assert.equal(missingCsrf.status, 403);

    const update = await performRequest(application.handler, '/api/v1/store/account', {
      method: 'PUT',
      headers: {
        cookie,
        'x-csrf-token': registrationPayload.data.csrfToken,
      },
      body: {
        email: 'cannot-change@example.com',
        fullName: 'Updated Owner',
      },
    });
    assert.equal(update.status, 200);
    assert.equal(json(update).data.account.fullName, 'Updated Owner');
    assert.equal(json(update).data.account.email, account.email);

    const wrongPassword = await performRequest(
      application.handler,
      '/api/v1/store/account/password',
      {
        method: 'POST',
        headers: {
          cookie,
          'x-csrf-token': registrationPayload.data.csrfToken,
        },
        body: {
          currentPassword: 'wrong-password',
          newPassword: 'replacement-password',
        },
      },
    );
    assert.equal(wrongPassword.status, 422);
    assert.ok(json(wrongPassword).error.details.currentPassword);

    const passwordChange = await performRequest(
      application.handler,
      '/api/v1/store/account/password',
      {
        method: 'POST',
        headers: {
          cookie,
          'x-csrf-token': registrationPayload.data.csrfToken,
        },
        body: {
          currentPassword: account.password,
          newPassword: 'replacement-password',
        },
      },
    );
    assert.equal(passwordChange.status, 200);
    assert.equal(json(passwordChange).data.changed, true);

    const currentSession = await performRequest(application.handler, '/api/v1/auth/session', {
      headers: { cookie },
    });
    assert.equal(currentSession.status, 200);
    assert.equal(json(currentSession).data.account.fullName, 'Updated Owner');

    const invalidatedSession = await performRequest(application.handler, '/api/v1/auth/session', {
      headers: { cookie: otherCookie },
    });
    assert.equal(invalidatedSession.status, 401);

    const oldPassword = await performRequest(application.handler, '/api/v1/auth/store/sign-in', {
      method: 'POST',
      body: { email: account.email, password: account.password },
    });
    assert.equal(oldPassword.status, 401);

    const newPassword = await performRequest(application.handler, '/api/v1/auth/store/sign-in', {
      method: 'POST',
      body: { email: account.email, password: 'replacement-password' },
    });
    assert.equal(newPassword.status, 200);
    assert.equal(
      application.database.get(
        "SELECT COUNT(*) AS count FROM audit_events WHERE actor_user_id = ? AND action LIKE 'account.%'",
        registrationPayload.data.account.userId,
      ).count,
      2,
    );
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

    await assert.rejects(
      () =>
        getOwnedBusiness(application.database, {
          business_id: json(second).data.account.businessId,
          user_id: json(first).data.account.userId,
        }),
      (error) => error.status === 404,
    );

    await assert.rejects(
      () =>
        getOwnedAccount(application.database, {
          business_id: json(second).data.account.businessId,
          user_id: json(first).data.account.userId,
        }),
      (error) => error.status === 404,
    );

    await assert.rejects(
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

test('Menu API enforces CSRF and ownership for categories and dishes', async () => {
  const application = await testApplication();

  try {
    const firstRegistration = await performRequest(
      application.handler,
      '/api/v1/auth/store/register',
      {
        method: 'POST',
        body: {
          fullName: 'First Owner',
          businessName: 'First Kitchen',
          email: 'first-menu@example.com',
          password: 'strong-password',
        },
      },
    );
    const firstPayload = json(firstRegistration);
    const firstCookie = cookieFrom(firstRegistration);

    const missingCsrf = await performRequest(application.handler, '/api/v1/store/categories', {
      method: 'POST',
      headers: { cookie: firstCookie },
      body: { name: 'Mains' },
    });
    assert.equal(missingCsrf.status, 403);

    const categoryResponse = await performRequest(application.handler, '/api/v1/store/categories', {
      method: 'POST',
      headers: {
        cookie: firstCookie,
        'x-csrf-token': firstPayload.data.csrfToken,
      },
      body: { name: 'Mains' },
    });
    const categoryId = json(categoryResponse).data.category.id;
    assert.equal(categoryResponse.status, 201);

    const dishResponse = await performRequest(application.handler, '/api/v1/store/dishes', {
      method: 'POST',
      headers: {
        cookie: firstCookie,
        'x-csrf-token': firstPayload.data.csrfToken,
      },
      body: {
        categoryId,
        description: 'Traditional Omani dish',
        name: 'Shuwa',
        priceBaisa: 4500,
        status: 'active',
      },
    });
    const dishId = json(dishResponse).data.dish.id;
    assert.equal(dishResponse.status, 201);

    const listResponse = await performRequest(
      application.handler,
      '/api/v1/store/dishes?status=active&search=shuwa',
      { headers: { cookie: firstCookie } },
    );
    assert.equal(listResponse.status, 200);
    assert.equal(json(listResponse).data.dishes[0].id, dishId);

    const protectedCategory = await performRequest(
      application.handler,
      `/api/v1/store/categories/${categoryId}`,
      {
        method: 'DELETE',
        headers: {
          cookie: firstCookie,
          'x-csrf-token': firstPayload.data.csrfToken,
        },
      },
    );
    assert.equal(protectedCategory.status, 409);

    const secondRegistration = await performRequest(
      application.handler,
      '/api/v1/auth/store/register',
      {
        method: 'POST',
        body: {
          fullName: 'Second Owner',
          businessName: 'Second Kitchen',
          email: 'second-menu@example.com',
          password: 'strong-password',
        },
      },
    );
    const secondCookie = cookieFrom(secondRegistration);
    const crossBusinessDish = await performRequest(
      application.handler,
      `/api/v1/store/dishes/${dishId}`,
      { headers: { cookie: secondCookie } },
    );
    assert.equal(crossBusinessDish.status, 404);
  } finally {
    await application.close();
  }
});

test('Orders API enforces CSRF, transitions, and business ownership', async () => {
  const application = await testApplication();

  try {
    const firstRegistration = await performRequest(
      application.handler,
      '/api/v1/auth/store/register',
      {
        method: 'POST',
        body: {
          fullName: 'Orders Owner',
          businessName: 'Orders Kitchen',
          email: 'orders@example.com',
          password: 'strong-password',
        },
      },
    );
    const firstPayload = json(firstRegistration);
    const firstCookie = cookieFrom(firstRegistration);
    const order = application.database.run(
      `INSERT INTO orders
        (business_id, order_number, subtotal_baisa, delivery_fee_baisa, total_baisa,
         customer_name, customer_phone, delivery_address)
       VALUES (?, 'API-1001', 4000, 500, 4500, 'Maha Al Harthi', '+968 9000 1111',
         'House 4, Al Khoudh')`,
      firstPayload.data.account.businessId,
    );
    const orderId = Number(order.lastInsertRowid);
    application.database.run(
      `INSERT INTO order_items
        (order_id, dish_name, quantity, unit_price_baisa, line_total_baisa)
       VALUES (?, 'Shuwa meal', 1, 4000, 4000)`,
      orderId,
    );

    const list = await performRequest(application.handler, '/api/v1/store/orders?status=pending', {
      headers: { cookie: firstCookie },
    });
    assert.equal(list.status, 200);
    assert.equal(json(list).data.orders[0].orderNumber, 'API-1001');

    const missingCsrf = await performRequest(
      application.handler,
      `/api/v1/store/orders/${orderId}/status`,
      {
        method: 'POST',
        headers: { cookie: firstCookie },
        body: { status: 'accepted' },
      },
    );
    assert.equal(missingCsrf.status, 403);

    const accepted = await performRequest(
      application.handler,
      `/api/v1/store/orders/${orderId}/status`,
      {
        method: 'POST',
        headers: {
          cookie: firstCookie,
          'x-csrf-token': firstPayload.data.csrfToken,
        },
        body: { status: 'accepted' },
      },
    );
    assert.equal(accepted.status, 200);
    assert.equal(json(accepted).data.order.status, 'accepted');

    const secondRegistration = await performRequest(
      application.handler,
      '/api/v1/auth/store/register',
      {
        method: 'POST',
        body: {
          fullName: 'Other Owner',
          businessName: 'Other Kitchen',
          email: 'other-orders@example.com',
          password: 'strong-password',
        },
      },
    );
    const crossBusiness = await performRequest(
      application.handler,
      `/api/v1/store/orders/${orderId}`,
      { headers: { cookie: cookieFrom(secondRegistration) } },
    );
    assert.equal(crossBusiness.status, 404);
  } finally {
    await application.close();
  }
});
