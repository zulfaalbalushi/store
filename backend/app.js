const env = require('dotenv');
env.config();

const express = require('express');

const app = express();

app.use(express.json());

app.use('/auth', require('./routes/auth'));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});