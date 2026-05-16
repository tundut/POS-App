const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_URL_LOCAL || 'postgresql://postgres:postgres@localhost:5432/pos_db';

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};