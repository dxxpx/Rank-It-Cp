// src/db.js
const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT ? Number(process.env.PG_PORT) : 5432,
  max: process.env.PG_MAX_CLIENTS ? Number(process.env.PG_MAX_CLIENTS) : 10,
  idleTimeoutMillis: process.env.PG_IDLE_MS
    ? Number(process.env.PG_IDLE_MS)
    : 30000,
  connectionTimeoutMillis: process.env.PG_CONN_TIMEOUT_MS
    ? Number(process.env.PG_CONN_TIMEOUT_MS)
    : 10000,
  ssl: {
    rejectUnauthorized: false,
  },
});

// optional: handle unexpected errors
pool.on("error", (err) => {
  console.error("Unexpected error on idle postgres client", err);
});

module.exports = pool;
