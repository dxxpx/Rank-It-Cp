// db.js
import { Pool } from "pg";

const pool = new Pool({
  user: process.env.PG_USER || "postgres",
  host: process.env.PG_HOST || "localhost",
  database: process.env.PG_DATABASE || "rankIt_db",
  password: process.env.PG_PASSWORD || "dpka",
  port: process.env.PG_PORT ? Number(process.env.PG_PORT) : 5432,

  // tuning: adjust to your load
  max: process.env.PG_MAX_CLIENTS ? Number(process.env.PG_MAX_CLIENTS) : 20, // max pooled clients
  idleTimeoutMillis: 30000, // free idle client after 30s
  connectionTimeoutMillis: 2000, // fail fast when connection can't be acquired

  // optional — keep TCP socket alive
  // keepAlive: true // node-postgres sets keepAlive by default in many environments
});

export default pool;
