// src/helpers.js
const pool = require("./db");

const sanitizeName = (s) => {
  if (!s || typeof s !== "string") throw new Error("Invalid name");
  return s
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "")
    .toLowerCase();
};

const isValidTableName = (s) => {
  if (typeof s !== "string") return false;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
};

const mapTypeToPostgres = (type) => {
  switch ((type || "").toLowerCase()) {
    case "string":
      return "TEXT";
    case "integer":
      return "INTEGER";
    case "float":
      return "DOUBLE PRECISION";
    case "boolean":
      return "BOOLEAN";
    case "date":
      return "TIMESTAMP";
    default:
      throw new Error(`Unsupported data type: ${type}`);
  }
};

const parseSumOf = (sum_of) => {
  if (!sum_of) return null;
  if (!Array.isArray(sum_of))
    throw new Error("sum_of must be an array of column names");
  return sum_of.map(sanitizeName);
};

// transaction helper using pooled client
async function withClient(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  sanitizeName,
  isValidTableName,
  mapTypeToPostgres,
  parseSumOf,
  withClient,
};
