// src/meta.js
const pool = require("./db");

async function ensureMetaTables() {
  const createSheets = `
    CREATE TABLE IF NOT EXISTS sheets (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      table_name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;

  const createColumns = `
    CREATE TABLE IF NOT EXISTS sheet_columns (
      id SERIAL PRIMARY KEY,
      sheet_id INTEGER REFERENCES sheets(id) ON DELETE CASCADE,
      column_name TEXT NOT NULL,
      data_type TEXT NOT NULL,
      sum_of TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;

  const client = await pool.connect();
  try {
    await client.query(createSheets);
    await client.query(createColumns);
  } finally {
    client.release();
  }
}

async function getColumnsForSheet(clientOrPool, sheetId) {
  const runner = typeof clientOrPool.query === "function" ? clientOrPool : pool;
  const { rows } = await runner.query(
    "SELECT * FROM sheet_columns WHERE sheet_id=$1 ORDER BY id",
    [sheetId]
  );
  return rows.map((r) => ({
    id: r.id,
    column_name: r.column_name,
    data_type: r.data_type,
    sum_of: r.sum_of ? JSON.parse(r.sum_of) : null,
  }));
}

async function getTableName(clientOrPool, sheetId) {
  const runner = typeof clientOrPool.query === "function" ? clientOrPool : pool;
  const { rows } = await runner.query(
    "SELECT table_name FROM sheets WHERE id=$1",
    [sheetId]
  );
  if (!rows.length) throw new Error("Sheet not found");
  return rows[0].table_name;
}

module.exports = {
  ensureMetaTables,
  getColumnsForSheet,
  getTableName,
};
