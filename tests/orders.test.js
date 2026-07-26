import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { openDatabase } from '../server/database/connection.js';
import { getOrder, listOrders, transitionOrder } from '../server/orders/service.js';

async function orderDatabase() {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'baytna-orders-'));
  const database = await openDatabase(path.join(temporaryDirectory, 'test.sqlite'));

  function createOwner(number) {
    const user = database.run(
      `INSERT INTO users (role, email, password_hash, full_name)
       VALUES ('store_owner', ?, 'test-only-hash', ?)`,
      `orders-owner-${number}@example.com`,
      `Owner ${number}`,
    );
    const userId = Number(user.lastInsertRowid);
    const business = database.run(
      `INSERT INTO businesses (owner_user_id, name, contact_email)
       VALUES (?, ?, ?)`,
      userId,
      `Kitchen ${number}`,
      `orders-owner-${number}@example.com`,
    );
    return { business_id: Number(business.lastInsertRowid), user_id: userId };
  }

  function createOrder(owner, number, overrides = {}) {
    const input = {
      createdAt: '2026-07-20 10:00:00',
      customerName: 'Maha Al Harthi',
      status: 'pending',
      subtotal: 8000,
      delivery: 1000,
      ...overrides,
    };
    const result = database.run(
      `INSERT INTO orders
        (business_id, order_number, status, subtotal_baisa, delivery_fee_baisa, total_baisa,
         customer_name, customer_phone, delivery_address, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '+968 9000 1111', 'House 4, Al Khoudh', ?, ?)`,
      owner.business_id,
      number,
      input.status,
      input.subtotal,
      input.delivery,
      input.subtotal + input.delivery,
      input.customerName,
      input.createdAt,
      input.createdAt,
    );
    const orderId = Number(result.lastInsertRowid);
    database.run(
      `INSERT INTO order_items
        (order_id, dish_name, quantity, unit_price_baisa, line_total_baisa)
       VALUES (?, 'Shuwa meal', 2, ?, ?)`,
      orderId,
      input.subtotal / 2,
      input.subtotal,
    );
    return orderId;
  }

  const firstOwner = createOwner(1);
  const secondOwner = createOwner(2);

  return {
    database,
    firstOwner,
    secondOwner,
    createOrder,
    async close() {
      database.close();
      await rm(temporaryDirectory, { recursive: true });
    },
  };
}

test('owners can search, filter, sort, and paginate only their orders', async () => {
  const application = await orderDatabase();
  try {
    application.createOrder(application.firstOwner, 'BAY-1001', {
      createdAt: '2026-07-20 10:00:00',
      subtotal: 3000,
    });
    application.createOrder(application.firstOwner, 'BAY-1002', {
      createdAt: '2026-07-21 10:00:00',
      status: 'accepted',
      subtotal: 9000,
    });
    application.createOrder(application.secondOwner, 'PRIVATE-1003');

    const result = listOrders(
      application.database,
      application.firstOwner,
      new URLSearchParams({
        dateFrom: '2026-07-21',
        dateTo: '2026-07-21',
        page: '1',
        pageSize: '1',
        search: '1002',
        sort: 'total_desc',
        status: 'accepted',
      }),
    );
    assert.equal(result.pagination.totalItems, 1);
    assert.equal(result.orders[0].orderNumber, 'BAY-1002');
    assert.equal(result.orders[0].itemCount, 2);

    const all = listOrders(
      application.database,
      application.firstOwner,
      new URLSearchParams({ pageSize: '1', sort: 'total_desc' }),
    );
    assert.equal(all.pagination.totalItems, 2);
    assert.equal(all.pagination.totalPages, 2);
    assert.equal(all.orders[0].orderNumber, 'BAY-1002');
    assert.throws(
      () =>
        listOrders(
          application.database,
          application.firstOwner,
          new URLSearchParams({ dateFrom: '2026-07-22', dateTo: '2026-07-21' }),
        ),
      (error) => error.status === 422,
    );
  } finally {
    await application.close();
  }
});

test('order details use snapshots and expose only fulfillment customer information', async () => {
  const application = await orderDatabase();
  try {
    const orderId = application.createOrder(application.firstOwner, 'BAY-2001');
    const order = getOrder(application.database, application.firstOwner, orderId);

    assert.deepEqual(order.customer, {
      deliveryAddress: 'House 4, Al Khoudh',
      name: 'Maha Al Harthi',
      phone: '+968 9000 1111',
    });
    assert.equal(order.items[0].dishName, 'Shuwa meal');
    assert.equal(order.items[0].quantity, 2);
    assert.equal('customerUserId' in order, false);
    assert.equal('email' in order.customer, false);
    assert.throws(
      () => getOrder(application.database, application.secondOwner, orderId),
      (error) => error.status === 404,
    );
  } finally {
    await application.close();
  }
});

test('status transitions write history and audit records and repeated requests are idempotent', async () => {
  const application = await orderDatabase();
  try {
    const orderId = application.createOrder(application.firstOwner, 'BAY-3001');
    const accepted = transitionOrder(application.database, application.firstOwner, orderId, {
      status: 'accepted',
    });
    assert.equal(accepted.changed, true);
    assert.equal(accepted.order.status, 'accepted');

    const repeated = transitionOrder(application.database, application.firstOwner, orderId, {
      status: 'accepted',
    });
    assert.equal(repeated.changed, false);
    assert.equal(
      application.database.get(
        'SELECT COUNT(*) AS count FROM order_status_history WHERE order_id = ?',
        orderId,
      ).count,
      1,
    );
    assert.ok(
      application.database.get(
        "SELECT id FROM audit_events WHERE action = 'order.status_changed' AND resource_id = ?",
        orderId,
      ),
    );
    assert.throws(
      () =>
        transitionOrder(application.database, application.firstOwner, orderId, {
          status: 'completed',
        }),
      (error) => error.status === 409,
    );
    assert.throws(
      () =>
        transitionOrder(application.database, application.secondOwner, orderId, {
          status: 'preparing',
        }),
      (error) => error.status === 404,
    );
  } finally {
    await application.close();
  }
});

test('rejected and cancelled transitions require and preserve a reason', async () => {
  const application = await orderDatabase();
  try {
    const rejectId = application.createOrder(application.firstOwner, 'BAY-4001');
    assert.throws(
      () =>
        transitionOrder(application.database, application.firstOwner, rejectId, {
          status: 'rejected',
        }),
      (error) => error.status === 422 && Boolean(error.details.reason),
    );

    const rejected = transitionOrder(application.database, application.firstOwner, rejectId, {
      reason: 'Kitchen capacity reached',
      status: 'rejected',
    });
    assert.equal(rejected.order.history[0].reason, 'Kitchen capacity reached');

    const cancelId = application.createOrder(application.firstOwner, 'BAY-4002', {
      status: 'accepted',
    });
    const cancelled = transitionOrder(application.database, application.firstOwner, cancelId, {
      reason: 'Ingredient unavailable',
      status: 'cancelled',
    });
    assert.equal(cancelled.order.status, 'cancelled');
    assert.equal(cancelled.order.history[0].reason, 'Ingredient unavailable');
  } finally {
    await application.close();
  }
});
