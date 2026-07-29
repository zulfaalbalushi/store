const express = require('express');
const db = require('../config/db');
const verifyToken = require('./middleware/auth');

const router = express.Router();

const ORDER_STATUSES = new Set([
    'pending',
    'confirmed',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
]);

function asPositiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
}

function asMoney(value) {
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function normaliseItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return null;
    }

    const normalisedItems = items.map((item) => {
        const listingId = asPositiveInteger(item.listing_id);
        const quantity = asPositiveInteger(item.quantity);
        const unitPrice = asMoney(item.unit_price);

        if (!listingId || !quantity || unitPrice === null) {
            return null;
        }

        return { listingId, quantity, unitPrice };
    });

    return normalisedItems.every(Boolean) ? normalisedItems : null;
}

// List a customer's orders. Supplying ?user_id= is optional for staff views.
router.get('/', async (req, res) => {
    const userId = req.query.user_id ? asPositiveInteger(req.query.user_id) : null;

    if (req.query.user_id && !userId) {
        return res.status(400).json({ message: 'user_id must be a positive integer.' });
    }

    try {
        const result = userId
            ? await db.query(
                `SELECT order_id, user_id, status, created_at, updated_at
                 FROM orders
                 WHERE user_id = $1
                 ORDER BY created_at DESC`,
                [userId],
            )
            : await db.query(
                `SELECT order_id, user_id, status, created_at, updated_at
                 FROM orders
                 ORDER BY created_at DESC`,
            );

        return res.json({ orders: result.rows });
    } catch (error) {
        console.error('Error loading orders:', error);
        return res.status(500).json({ message: 'Unable to load orders.' });
    }
});

// Load one order together with the products that were purchased.
router.get('/:id', async (req, res) => {
    const orderId = asPositiveInteger(req.params.id);
    if (!orderId) {
        return res.status(400).json({ message: 'Order id must be a positive integer.' });
    }

    try {
        const [orderResult, itemsResult] = await Promise.all([
            db.query(
                `SELECT order_id, user_id, status, created_at, updated_at
                 FROM orders WHERE order_id = $1`,
                [orderId],
            ),
            db.query(
                `SELECT order_item_id, listing_id, quantity, price_at_purchase
                 FROM order_items WHERE order_id = $1 ORDER BY order_item_id`,
                [orderId],
            ),
        ]);

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ message: 'Order not found.' });
        }

        return res.json({ ...orderResult.rows[0], items: itemsResult.rows });
    } catch (error) {
        console.error('Error loading order:', error);
        return res.status(500).json({ message: 'Unable to load the order.' });
    }
});

// Create an order and its line items as one database transaction.
router.post('/', verifyToken, async (req, res) => {
    const userId = asPositiveInteger(req.body.user_id);
    const items = normaliseItems(req.body.items);

    if (!userId || !items) {
        return res.status(400).json({
            message: 'user_id and at least one valid item are required.',
        });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const orderResult = await client.query(
            `INSERT INTO orders (user_id, status)
             VALUES ($1, 'pending')
             RETURNING order_id, user_id, status, created_at, updated_at`,
            [userId],
        );

        const order = orderResult.rows[0];
        const createdItems = [];
        for (const item of items) {
            const itemResult = await client.query(
                `INSERT INTO order_items (order_id, listing_id, quantity, price_at_purchase)
                 VALUES ($1, $2, $3, $4)
                 RETURNING order_item_id, listing_id, quantity, price_at_purchase`,
                [order.order_id, item.listingId, item.quantity, item.unitPrice],
            );
            createdItems.push(itemResult.rows[0]);
        }

        await client.query('COMMIT');
        return res.status(201).json({ ...order, items: createdItems });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating order:', error);
        return res.status(500).json({ message: 'Unable to create the order.' });
    } finally {
        client.release();
    }
});

// Update only the fulfilment status; order prices and items stay immutable.
router.patch('/:id/status', verifyToken, async (req, res) => {
    const orderId = asPositiveInteger(req.params.id);
    const status = typeof req.body.status === 'string' ? req.body.status.toLowerCase() : '';

    if (!orderId || !ORDER_STATUSES.has(status)) {
        return res.status(400).json({ message: 'Provide a valid order id and status.' });
    }

    try {
        const result = await db.query(
            `UPDATE orders
             SET status = $1, updated_at = CURRENT_TIMESTAMP
             WHERE order_id = $2
             RETURNING order_id, user_id, status, created_at, updated_at`,
            [status, orderId],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Order not found.' });
        }

        return res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating order status:', error);
        return res.status(500).json({ message: 'Unable to update the order.' });
    }
});

module.exports = router;