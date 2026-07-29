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

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // 1. Find the user by email
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const user = result.rows[0];

        // 2. Compare submitted password against stored hash
        const passwordMatches = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatches) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        // 3. Sign a JWT
        const jwt = require('jsonwebtoken'); // move this to the top of the file with your other requires
        const token = jwt.sign({ userId: user.user_id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        // 4. Send it back
        res.status(200).json({ message: 'Login successful.', token });

    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

module.exports = router;    