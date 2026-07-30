// USES CRUD

const express = require('express');
const router = express.Router();
const db = require('../config/db.js');

router.get('/', async (req, res) => {
    try {
        const listings = await db.query(
            `SELECT l.listing_id, l.listing_name, l.price, l.image_url, s.name AS store_name
             FROM listings l
             JOIN users s ON l.seller_id = s.user_id`
        );
        res.json(listings.rows);
    } catch (error) {
        console.error('Error fetching listings:', error);
        res.status(500).json({ message: 'Unable to fetch listings.' });
    }
});

module.exports = router;