const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/db.js');

router.post('/signup', async (req, res) => {
    const { email, password } = req.body;

    try { 
         const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);


        if (existingUser.rows.length > 0) {
            return res.status(400).json( { message: 'User already exists.'});
        }

        const password_hash = await bcrypt.hash(password, 10);

        const newUser = await db.query(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING user_id, email', [email, password_hash]);

        res.status(201).json({ message: 'User created successfully.', user: newUser.rows[0] });

    } catch (error) {
        console.error('Error during signup:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

module.exports = router;    