const env = require('dotenv');
const cors = require('cors');
env.config();

const express = require('express');

const app = express();

app.use(express.json());

app.use(cors());

app.use('/auth', require('./routes/auth'));

app.use('/orders', require('./routes/orders'));

app.use('/listings', require('./routes/listings'));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});