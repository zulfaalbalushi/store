import { conflict, notFound, validationError } from '../http/errors.js';

const ORDER_STATUSES = [
  'pending',
  'accepted',
  'preparing',
  'ready',
  'completed',
  'rejected',
  'cancelled',
];
const STATUS_TRANSITIONS = {
  pending: new Set(['accepted', 'rejected']),
  accepted: new Set(['preparing', 'cancelled']),
  preparing: new Set(['ready', 'cancelled']),
  ready: new Set(['completed']),
  completed: new Set(),
  rejected: new Set(),
  cancelled: new Set(),
};
const SORTS = {
  newest: 'orders.created_at DESC, orders.id DESC',
  oldest: 'orders.created_at ASC, orders.id ASC',
  total_asc: 'orders.total_baisa ASC, orders.id ASC',
  total_desc: 'orders.total_baisa DESC, orders.id DESC',
};
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function validDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function listOrderResponse(row) {
  return {
    createdAt: row.created_at,
    customerName: row.customer_name,
    id: row.id,
    itemCount: Number(row.item_count),
    orderNumber: row.order_number,
    status: row.status,
    totalBaisa: row.total_baisa,
    updatedAt: row.updated_at,
  };
}

async function ownedOrderRow(database, session, orderId) {
  const id = positiveInteger(orderId);
  const order = id
    ? await database.get(
        'SELECT * FROM orders WHERE id = ? AND business_id = ?',
        id,
        session.business_id,
      )
    : null;

  if (!order) throw notFound('The order was not found.');
  return order;
}

async function orderDetails(database, session, orderId) {
  const order = await ownedOrderRow(database, session, orderId);
  const items = await database.all(
    `SELECT id, dish_id, dish_name, quantity, unit_price_baisa, line_total_baisa
     FROM order_items
     WHERE order_id = ?
     ORDER BY id`,
    order.id,
  );
  const history = await database.all(
    `SELECT order_status_history.id, order_status_history.from_status,
      order_status_history.to_status, order_status_history.reason,
      order_status_history.created_at, users.full_name AS changed_by
     FROM order_status_history
     LEFT JOIN users ON users.id = order_status_history.changed_by_user_id
     WHERE order_status_history.order_id = ?
     ORDER BY order_status_history.created_at, order_status_history.id`,
    order.id,
  );

  return {
    createdAt: order.created_at,
    customer: {
      deliveryAddress: order.delivery_address,
      name: order.customer_name,
      phone: order.customer_phone,
    },
    deliveryFeeBaisa: order.delivery_fee_baisa,
    history: history.map((entry) => ({
      changedBy: entry.changed_by,
      createdAt: entry.created_at,
      fromStatus: entry.from_status,
      id: entry.id,
      reason: entry.reason,
      toStatus: entry.to_status,
    })),
    id: order.id,
    items: items.map((item) => ({
      dishId: item.dish_id,
      dishName: item.dish_name,
      id: item.id,
      lineTotalBaisa: item.line_total_baisa,
      quantity: item.quantity,
      unitPriceBaisa: item.unit_price_baisa,
    })),
    orderNumber: order.order_number,
    status: order.status,
    subtotalBaisa: order.subtotal_baisa,
    totalBaisa: order.total_baisa,
    updatedAt: order.updated_at,
  };
}

export async function listOrders(database, session, query) {
  const errors = {};
  const search = cleanText(query.get('search'));
  const status = cleanText(query.get('status')) || 'all';
  const dateFrom = cleanText(query.get('dateFrom'));
  const dateTo = cleanText(query.get('dateTo'));
  const page = Math.max(1, positiveInteger(query.get('page')) || 1);
  const pageSize = Math.min(50, Math.max(1, positiveInteger(query.get('pageSize')) || 10));
  const sort = SORTS[query.get('sort')] ? query.get('sort') : 'newest';
  const where = ['orders.business_id = ?'];
  const parameters = [session.business_id];

  if (search.length > 50) errors.search = 'Order search cannot exceed 50 characters.';
  if (status !== 'all' && !ORDER_STATUSES.includes(status)) {
    errors.status = 'Select a valid order status.';
  }
  if (dateFrom && !validDate(dateFrom)) errors.dateFrom = 'Enter a valid start date.';
  if (dateTo && !validDate(dateTo)) errors.dateTo = 'Enter a valid end date.';
  if (dateFrom && dateTo && validDate(dateFrom) && validDate(dateTo) && dateFrom > dateTo) {
    errors.dateTo = 'End date cannot be earlier than start date.';
  }
  if (Object.keys(errors).length > 0) throw validationError(errors);

  if (search) {
    const escapedSearch = search.replace(/[\\%_]/g, '\\$&');
    where.push("LOWER(orders.order_number) LIKE LOWER(?) ESCAPE '\\'");
    parameters.push(`%${escapedSearch}%`);
  }
  if (status !== 'all') {
    where.push('orders.status = ?');
    parameters.push(status);
  }
  if (dateFrom) {
    where.push('orders.created_at >= ?');
    parameters.push(`${dateFrom} 00:00:00`);
  }
  if (dateTo) {
    const nextDay = new Date(`${dateTo}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    where.push('orders.created_at < ?');
    parameters.push(nextDay.toISOString());
  }

  const whereSql = where.join(' AND ');
  const totalItems = Number(
    (await database.get(`SELECT COUNT(*) AS total FROM orders WHERE ${whereSql}`, ...parameters))
      .total,
  );
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const orders = (
    await database.all(
      `SELECT orders.*,
        (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = orders.id)
          AS item_count
       FROM orders
       WHERE ${whereSql}
       ORDER BY ${SORTS[sort]}
       LIMIT ? OFFSET ?`,
      ...parameters,
      pageSize,
      (currentPage - 1) * pageSize,
    )
  ).map(listOrderResponse);

  return {
    orders,
    pagination: {
      page: currentPage,
      pageSize,
      totalItems,
      totalPages,
    },
  };
}

export async function getOrder(database, session, orderId) {
  return orderDetails(database, session, orderId);
}

export async function transitionOrder(database, session, orderId, input) {
  const order = await ownedOrderRow(database, session, orderId);
  const targetStatus = cleanText(input?.status);
  const reason = cleanText(input?.reason);

  if (!ORDER_STATUSES.includes(targetStatus)) {
    throw validationError({ status: 'Select a valid order status.' });
  }

  if (targetStatus === order.status) {
    return {
      changed: false,
      order: await orderDetails(database, session, order.id),
    };
  }

  if (!STATUS_TRANSITIONS[order.status].has(targetStatus)) {
    throw conflict(`An order cannot move from ${order.status} to ${targetStatus}.`);
  }

  if (
    ['rejected', 'cancelled'].includes(targetStatus) &&
    (reason.length < 3 || reason.length > 500)
  ) {
    throw validationError({
      reason: 'Provide a reason containing between 3 and 500 characters.',
    });
  }

  await database.transaction(async (transaction) => {
    const result = await transaction.run(
      `UPDATE orders
       SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND business_id = ? AND status = ?`,
      targetStatus,
      order.id,
      session.business_id,
      order.status,
    );

    if (result.changes !== 1) {
      throw conflict('The order changed while you were viewing it. Refresh and try again.');
    }

    await transaction.run(
      `INSERT INTO order_status_history
        (order_id, changed_by_user_id, from_status, to_status, reason)
       VALUES (?, ?, ?, ?, ?)`,
      order.id,
      session.user_id,
      order.status,
      targetStatus,
      reason,
    );
    await transaction.run(
      `INSERT INTO audit_events
        (business_id, actor_user_id, action, resource_type, resource_id, metadata_json)
       VALUES (?, ?, 'order.status_changed', 'order', ?, ?)`,
      session.business_id,
      session.user_id,
      order.id,
      JSON.stringify({ fromStatus: order.status, toStatus: targetStatus }),
    );
  });

  return {
    changed: true,
    order: await orderDetails(database, session, order.id),
  };
}
