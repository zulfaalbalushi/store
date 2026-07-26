require('dotenv').config();

const express = require('express');
const cors = require('cors');
const ordersRouter = require('./routes/orders');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

app.use('/api/orders', ordersRouter);

app.use((error, _req, res, _next) => {
    console.error('Unhandled server error:', error);
    res.status(500).json({ message: 'Internal server error.' });
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Store API is running at http://localhost:${port}`);
    });
}

module.exports = app;
