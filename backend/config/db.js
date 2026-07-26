require('dotenv').config();

// Creating a pool so that we can reuse connections to the database instead of creating a new one for each request. This improves performance and resource usage.
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
})

// Exporting a query function that can be used to execute SQL queries against the database. This function takes a SQL query string and an array of parameters, and returns a promise that resolves with the query result.
module.exports = {
    query: (text, params) => pool.query(text, params),
}

