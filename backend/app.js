// app.js
// Node.js + Express backend using a single shared pg.Pool (persistent across requests)
// Endpoints:
//  POST   /sheets                       -> create sheet (creates a Postgres table + metadata)
//  POST   /sheets/:sheetId/rows         -> add new row (auto-calc sum-columns)
//  PUT    /sheets/:sheetId/rows/:rowId  -> update row (recalc sum-columns)
//  GET    /sheets/:sheetId/rows/:rowId  -> get a specific row
//  GET    /sheets/:sheetId/export       -> export sheet to Excel (.xlsx)

const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const ExcelJS = require("exceljs");

const app = express();
app.use(bodyParser.json());
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

// -------------------- Pool (single shared instance) --------------------
const pool = new Pool({
  user: process.env.PG_USER || "postgres",
  host: process.env.PG_HOST || "localhost",
  database: process.env.PG_DATABASE || "rankIt_db",
  password: process.env.PG_PASSWORD || "dpka",
  port: process.env.PG_PORT ? Number(process.env.PG_PORT) : 5432,

  // tuning: adjust for your environment
  max: process.env.PG_MAX_CLIENTS ? Number(process.env.PG_MAX_CLIENTS) : 20, // max pooled clients
  idleTimeoutMillis: process.env.PG_IDLE_MS
    ? Number(process.env.PG_IDLE_MS)
    : 30000,
  connectionTimeoutMillis: process.env.PG_CONN_TIMEOUT_MS
    ? Number(process.env.PG_CONN_TIMEOUT_MS)
    : 2000,
});
// app.js
// Node.js + Express backend using a single shared pg.Pool (persistent across requests)
// Endpoints:
//  POST   /sheets                       -> create sheet (creates a Postgres table + metadata)
//  POST   /sheets/:sheetId/rows         -> add new row (auto-calc sum-columns)
//  PUT    /sheets/:sheetId/rows/:rowId  -> update row (recalc sum-columns)
//  GET    /sheets/:sheetId/rows/:rowId  -> get a specific row
//  GET    /sheets/:sheetId/export       -> export sheet to Excel (.xlsx)
//  GET    /tables/check?tableName=...   -> check if a given postgres table name already exists

// -------------------- Helpers --------------------
const sanitizeName = (s) => {
  if (!s || typeof s !== "string") throw new Error("Invalid name");
  return s
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "")
    .toLowerCase();
};

const isValidTableName = (s) => {
  // allow only letters, numbers, underscore and must start with letter or underscore per SQL rules
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

// transaction helper that checks out a pooled client and returns it
async function withClient(fn) {
  const client = await pool.connect(); // checks out pooled client
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
    client.release(); // return client to pool
  }
}

// -------------------- DB metadata setup (run once externally or call this route) --------------------
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

// call at startup
ensureMetaTables().catch((err) => {
  console.error("Failed to ensure metadata tables exist:", err);
  process.exit(1);
});

// -------------------- Metadata helpers --------------------
async function getColumnsForSheet(client, sheetId) {
  const { rows } = await client.query(
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

// -------------------- Endpoints --------------------

// Create a new sheet (table + metadata)
// POST /sheets
// body: { sheetName: string, columns: [{ name, type, sum_of? }] }
app.post("/sheets", async (req, res) => {
  try {
    const { sheetName, columns } = req.body;
    if (!sheetName || !Array.isArray(columns) || columns.length === 0) {
      return res
        .status(400)
        .json({ error: "sheetName and columns[] are required" });
    }

    const safeSheetName = sanitizeName(sheetName);

    const result = await withClient(async (client) => {
      const tableName = `${safeSheetName}`;

      // insert sheet metadata
      const insertSheet = await client.query(
        "INSERT INTO sheets(name, table_name) VALUES($1, $2) RETURNING id, table_name",
        [sheetName, tableName]
      );
      const sheetId = insertSheet.rows[0].id;

      // prepare column definitions for CREATE TABLE
      const colDefs = [];
      for (const col of columns) {
        if (!col.name || !col.type)
          throw new Error("Each column requires name and type");
        const colName = sanitizeName(col.name);
        const sqlType = mapTypeToPostgres(col.type);
        colDefs.push(`"${colName}" ${sqlType}`);

        const sumOf = col.sum_of
          ? JSON.stringify(parseSumOf(col.sum_of))
          : null;
        await client.query(
          "INSERT INTO sheet_columns(sheet_id, column_name, data_type, sum_of) VALUES($1, $2, $3, $4)",
          [sheetId, colName, col.type.toLowerCase(), sumOf]
        );
      }

      const createTableSQL = `CREATE TABLE "${tableName}" (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT NOW(),
        ${colDefs.join(",\n")}
      );`;

      await client.query(createTableSQL);
      return { sheetId, tableName };
    });

    res.json({
      message: "Sheet created",
      sheetId: result.sheetId,
      tableName: result.tableName,
    });
  } catch (err) {
    console.error("Error creating sheet:", err);
    res.status(500).json({ error: err.message });
  }
});

// Add new row and auto-calc sum columns
// POST /sheets/:sheetId/rows
// body: { values: { colName: value, ... } }
app.post("/sheets/:sheetId/rows", async (req, res) => {
  const sheetId = Number(req.params.sheetId);
  const bodyValues = req.body.values || {};
  try {
    if (Number.isNaN(sheetId))
      return res.status(400).json({ error: "Invalid sheetId" });

    const inserted = await withClient(async (client) => {
      const tableName = await getTableName(client, sheetId);
      const columns = await getColumnsForSheet(client, sheetId);

      const insertCols = [];
      const insertVals = [];
      const placeholders = [];

      const normalizedInput = {};
      for (const k of Object.keys(bodyValues))
        normalizedInput[sanitizeName(k)] = bodyValues[k];

      // non-sum columns first
      for (const col of columns) {
        if (!col.sum_of) {
          const cname = col.column_name;
          insertCols.push(`"${cname}"`);
          insertVals.push(
            normalizedInput.hasOwnProperty(cname)
              ? normalizedInput[cname]
              : null
          );
          placeholders.push(`$${insertVals.length}`);
        }
      }

      // sum columns computed from normalizedInput
      for (const col of columns) {
        if (col.sum_of) {
          const cname = col.column_name;
          let sum = 0;
          for (const src of col.sum_of) {
            const val = normalizedInput.hasOwnProperty(src)
              ? normalizedInput[src]
              : null;
            const numeric =
              val === null || val === undefined || val === "" ? 0 : Number(val);
            if (isNaN(numeric)) {
              throw new Error(
                `Value for column "${src}" is not numeric but required for sum column "${cname}"`
              );
            }
            sum += numeric;
          }
          insertCols.push(`"${cname}"`);
          insertVals.push(sum);
          placeholders.push(`$${insertVals.length}`);
        }
      }

      const q = `INSERT INTO "${tableName}" (${insertCols.join(",")}) VALUES (${placeholders.join(",")}) RETURNING id, *`;
      const r = await client.query(q, insertVals);
      return r.rows[0];
    });

    res.json({ message: "Row added", row: inserted });
  } catch (err) {
    console.error("Error adding row:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update a row and recalculate sums
// PUT /sheets/:sheetId/rows/:rowId
// body: { values: { colName: value, ... } }
app.put("/sheets/:sheetId/rows/:rowId", async (req, res) => {
  const sheetId = Number(req.params.sheetId);
  const rowId = Number(req.params.rowId);
  const bodyValues = req.body.values || {};
  try {
    if (Number.isNaN(sheetId) || Number.isNaN(rowId))
      return res.status(400).json({ error: "Invalid ids" });

    const updated = await withClient(async (client) => {
      const tableName = await getTableName(client, sheetId);
      const columns = await getColumnsForSheet(client, sheetId);

      const existingQ = await client.query(
        `SELECT * FROM "${tableName}" WHERE id=$1`,
        [rowId]
      );
      if (!existingQ.rows.length) throw new Error("Row not found");
      const existingRow = existingQ.rows[0];

      const normalizedInput = {};
      for (const k of Object.keys(bodyValues))
        normalizedInput[sanitizeName(k)] = bodyValues[k];

      const setParts = [];
      const values = [];

      // update non-sum columns if provided
      for (const col of columns) {
        if (!col.sum_of) {
          const cname = col.column_name;
          if (normalizedInput.hasOwnProperty(cname)) {
            values.push(normalizedInput[cname]);
            setParts.push(`"${cname}" = $${values.length}`);
          }
        }
      }

      // compute sum columns using (input override) or existing
      for (const col of columns) {
        if (col.sum_of) {
          const cname = col.column_name;
          let sum = 0;
          for (const src of col.sum_of) {
            let val;
            if (normalizedInput.hasOwnProperty(src)) val = normalizedInput[src];
            else val = existingRow[src];

            const numeric =
              val === null || val === undefined || val === "" ? 0 : Number(val);
            if (isNaN(numeric)) {
              throw new Error(
                `Value for column "${src}" is not numeric but required for sum column "${cname}"`
              );
            }
            sum += numeric;
          }
          values.push(sum);
          setParts.push(`"${cname}" = $${values.length}`);
        }
      }

      if (setParts.length === 0) return existingRow; // nothing to update

      const q = `UPDATE "${tableName}" SET ${setParts.join(", ")} WHERE id=$${values.length + 1} RETURNING *`;
      values.push(rowId);
      const r = await client.query(q, values);
      return r.rows[0];
    });

    res.json({ message: "Row updated", row: updated });
  } catch (err) {
    console.error("Error updating row:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get a row
// GET /sheets/:sheetId/rows/:rowId
app.get("/sheets/:sheetId/rows/:rowId", async (req, res) => {
  const sheetId = Number(req.params.sheetId);
  const rowId = Number(req.params.rowId);
  try {
    if (Number.isNaN(sheetId) || Number.isNaN(rowId))
      return res.status(400).json({ error: "Invalid ids" });

    const tableName = await getTableName(pool, sheetId);
    const { rows } = await pool.query(
      `SELECT * FROM "${tableName}" WHERE id=$1`,
      [rowId]
    );
    if (!rows.length) return res.status(404).json({ error: "Row not found" });
    res.json({ row: rows[0] });
  } catch (err) {
    console.error("Error fetching row:", err);
    res.status(500).json({ error: err.message });
  }
});

// Export sheet to Excel
// GET /sheets/:sheetId/export
app.get("/sheets/:sheetId/export", async (req, res) => {
  const sheetId = Number(req.params.sheetId);
  try {
    if (Number.isNaN(sheetId))
      return res.status(400).json({ error: "Invalid sheetId" });

    const { rows: sheetRows } = await pool.query(
      "SELECT * FROM sheets WHERE id=$1",
      [sheetId]
    );
    if (!sheetRows.length)
      return res.status(404).json({ error: "Sheet not found" });
    const sheetMeta = sheetRows[0];
    const client = await pool.connect();
    try {
      const columns = await getColumnsForSheet(client, sheetId);
      const tableName = sheetMeta.table_name;
      const { rows } = await client.query(
        `SELECT * FROM "${tableName}" ORDER BY id`
      );

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(sheetMeta.name || `sheet_${sheetId}`);

      const header = columns.map((c) => c.column_name);
      ws.addRow(["id", "created_at", ...header]);

      for (const r of rows) {
        const rowValues = [r.id, r.created_at];
        for (const c of columns) rowValues.push(r[c.column_name]);
        ws.addRow(rowValues);
      }

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${sheetMeta.name || "sheet"}.xlsx"`
      );
      await wb.xlsx.write(res);
      res.end();
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error exporting sheet:", err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// -------------------- NEW ENDPOINT --------------------
// Check if a postgres table name already exists
// GET /tables/check?tableName=your_table_name
// returns { status: "Available" } or { status: "Already taken" }
app.get("/tables/check", async (req, res) => {
  try {
    const rawName = req.query.tableName;
    if (!rawName || typeof rawName !== "string") {
      return res
        .status(400)
        .json({ error: "tableName query parameter is required" });
    }

    // sanitize but also enforce SQL-valid table name pattern
    const tableName = sanitizeName(rawName);
    if (!isValidTableName(tableName)) {
      return res.status(400).json({
        error:
          "Invalid table name. Use letters, numbers and underscores, and start with a letter or underscore.",
      });
    }

    // Query information_schema safely using parameterized query
    const q = `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS present;
    `;
    const { rows } = await pool.query(q, [tableName]);
    const exists = rows[0] && rows[0].present;

    if (exists) return res.json({ status: "Already taken" });
    return res.json({ status: "Available" });
  } catch (err) {
    console.error("Error checking table existence:", err);
    res.status(500).json({ error: err.message });
  }
});

// Requires: upload (multer), ExcelJS, sanitizeName, mapTypeToPostgres, withClient, pool, etc.

app.post("/sheets/upload-excel", upload.single("file"), async (req, res) => {
  try {
    if (!req.file)
      return res
        .status(400)
        .json({ error: 'No file uploaded (field name must be "file")' });

    // Preview flag can be sent as form field or query param (string 'true')
    const previewFlag =
      (req.body && req.body.preview === "true") ||
      (req.query && req.query.preview === "true");
    const sampleSize = req.body.sampleSize
      ? Math.max(1, Math.min(100, Number(req.body.sampleSize)))
      : 10;

    const providedName =
      req.body.sheetName || req.file.originalname.replace(/\.[^.]+$/, "");
    const safeSheetName = sanitizeName(providedName || `import_${Date.now()}`);
    const worksheetName = req.body.worksheet || null;

    // read workbook from buffer
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    // pick worksheet
    let worksheet;
    if (worksheetName) {
      worksheet = workbook.getWorksheet(worksheetName);
      if (!worksheet)
        return res
          .status(400)
          .json({
            error: `Worksheet "${worksheetName}" not found in the uploaded file.`,
          });
    } else {
      worksheet = workbook.worksheets[0];
      if (!worksheet)
        return res
          .status(400)
          .json({ error: "No worksheets found in the uploaded file." });
    }

    // read rows (include empty rows as [] is undesirable; we keep only rows with any non-empty cell)
    const rawRows = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values; // 1-based
      rawRows.push(values.slice(1));
    });

    if (!rawRows.length)
      return res.status(400).json({ error: "Worksheet is empty" });

    // header row
    const rawHeader = rawRows[0].map((h) =>
      h === null || h === undefined ? "" : String(h).trim()
    );
    const sumRegex = /^(.+?)__sum\((.+?)\)$/i;

    const sanitizedCols = [];
    const sumOfMap = {}; // idx -> [source sanitized names]
    const seen = new Map();

    for (let i = 0; i < rawHeader.length; ++i) {
      let headerCell = rawHeader[i] || `col${i + 1}`;

      let isSum = false;
      let baseName = headerCell;
      let sumSources = null;

      const m = headerCell.match(sumRegex);
      if (m) {
        isSum = true;
        baseName = m[1].trim();
        const sourcesRaw = m[2]
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (!sourcesRaw.length) {
          return res
            .status(400)
            .json({
              error: `Invalid sum definition in header "${headerCell}"`,
            });
        }
        sumSources = sourcesRaw.map(sanitizeName);
      }

      let colName = sanitizeName(baseName || `col${i + 1}`);
      if (seen.has(colName)) {
        const count = seen.get(colName) + 1;
        seen.set(colName, count);
        colName = `${colName}_${count}`;
      } else {
        seen.set(colName, 1);
      }

      sanitizedCols.push(colName);
      if (isSum) sumOfMap[i] = sumSources;
    }

    // data rows (skip header)
    const dataRawRows = rawRows.slice(1).map((r) => {
      const arr = [];
      for (let i = 0; i < sanitizedCols.length; ++i)
        arr.push(i < r.length ? r[i] : null);
      return arr;
    });

    // type inference (same heuristic as before)
    function inferColumnType(values) {
      const sample = values.slice(0, 50);
      let isInt = true,
        isFloat = true,
        isBoolean = true,
        isDate = true;
      let hasAny = false;
      for (const v of sample) {
        if (v === null || v === undefined || v === "") continue;
        hasAny = true;
        if (v instanceof Date) {
          isBoolean = false;
          isInt = false;
          isFloat = false;
          continue;
        }
        const s = String(v).trim();
        if (!/^(true|false|yes|no|1|0)$/i.test(s)) isBoolean = false;
        const num = Number(s);
        if (!isFinite(num)) {
          isInt = false;
          isFloat = false;
        } else {
          if (!Number.isInteger(num)) isInt = false;
        }
        if (isNaN(Date.parse(s))) isDate = false;
      }
      if (!hasAny) return "string";
      if (isBoolean) return "boolean";
      if (isInt) return "integer";
      if (isFloat) return "float";
      if (isDate) return "date";
      return "string";
    }

    // build inferred types and columnsMeta (sum columns default to float)
    const inferredTypes = [];
    const columnsMeta = [];
    for (let ci = 0; ci < sanitizedCols.length; ++ci) {
      if (sumOfMap.hasOwnProperty(ci)) {
        inferredTypes[ci] = "float";
        columnsMeta.push({
          name: sanitizedCols[ci],
          type: "float",
          sum_of: sumOfMap[ci],
        });
      } else {
        const colVals = dataRawRows.map((r) => r[ci]);
        const t = inferColumnType(colVals);
        inferredTypes[ci] = t;
        columnsMeta.push({ name: sanitizedCols[ci], type: t, sum_of: null });
      }
    }

    // validate sum sources exist among sanitizedCols
    const colIndexByName = {};
    sanitizedCols.forEach((c, i) => (colIndexByName[c] = i));
    for (const [sumColIdxStr, sources] of Object.entries(sumOfMap)) {
      for (const src of sources) {
        if (!colIndexByName.hasOwnProperty(src)) {
          return res
            .status(400)
            .json({
              error: `Sum column "${sanitizedCols[Number(sumColIdxStr)]}" references unknown source column "${src}" (after sanitization)`,
            });
        }
      }
    }

    // helper: parse a single raw row into typed values and compute sum columns
    function parseAndComputeRow(rawRow, rowNumber = null) {
      const parsedRow = new Array(sanitizedCols.length).fill(null);
      // parse non-sum columns
      for (let ci = 0; ci < sanitizedCols.length; ++ci) {
        if (sumOfMap.hasOwnProperty(ci)) continue;
        const raw = rawRow[ci];
        const t = inferredTypes[ci];
        let parsed = null;
        if (raw === null || raw === undefined || raw === "") parsed = null;
        else if (raw instanceof Date) parsed = raw;
        else {
          const s = String(raw).trim();
          if (t === "integer") {
            const n = Number.parseInt(s, 10);
            parsed = Number.isNaN(n) ? null : n;
          } else if (t === "float") {
            const n = Number.parseFloat(s);
            parsed = Number.isNaN(n) ? null : n;
          } else if (t === "boolean")
            parsed = /^(true|yes|1)$/i.test(s) ? true : false;
          else if (t === "date") {
            const d = new Date(s);
            parsed = isNaN(d.getTime()) ? null : d;
          } else parsed = s;
        }
        parsedRow[ci] = parsed;
      }
      // compute sum columns
      for (const [sumColIdxStr, sources] of Object.entries(sumOfMap)) {
        const sumColIdx = Number(sumColIdxStr);
        let sum = 0;
        for (const srcName of sources) {
          const srcIdx = colIndexByName[srcName];
          const val = parsedRow[srcIdx];
          const numeric =
            val === null || val === undefined || val === "" ? 0 : Number(val);
          if (Number.isNaN(numeric)) {
            // For preview mode we won't throw — we set null and mark a warning
            return {
              error: `Non-numeric value for sum source "${srcName}" at row ${rowNumber}`,
              row: null,
            };
          }
          sum += numeric;
        }
        parsedRow[sumColIdx] = sum;
      }
      return { error: null, row: parsedRow };
    }

    // If preview requested, build sampleRows and return inferred schema — DO NOT touch DB
    if (previewFlag) {
      const sampleRows = [];
      const previewWarnings = [];
      const max = Math.min(sampleSize, dataRawRows.length);
      for (let i = 0; i < max; ++i) {
        const result = parseAndComputeRow(dataRawRows[i], i + 2); // +2: header + 1-based
        if (result.error) previewWarnings.push(result.error);
        sampleRows.push(result.row);
      }

      return res.json({
        message: "Preview generated (no DB changes)",
        sheetName: providedName,
        safeSheetName,
        worksheet: worksheetName || worksheet.name,
        detectedRows: dataRawRows.length,
        columns: columnsMeta,
        sanitizedCols,
        inferredTypes,
        sampleRows,
        warnings: previewWarnings,
      });
    }

    // If not preview: proceed with actual import (existing behavior - create table, metadata insertion, batch insert)
    // NOTE: We'll reuse the existing insertion logic (same as your previous upload handler)
    // Precompute numeric indices for sum columns
    const sumSourcesIndices = {};
    for (const [sumColIdxStr, sources] of Object.entries(sumOfMap)) {
      const sumColIdx = Number(sumColIdxStr);
      sumSourcesIndices[sumColIdx] = sources.map((s) => colIndexByName[s]);
    }

    // Create table & insert rows
    const result = await withClient(async (client) => {
      const tableName = `${safeSheetName}_${Date.now()}`;
      const insertSheet = await client.query(
        "INSERT INTO sheets(name, table_name) VALUES($1, $2) RETURNING id",
        [providedName, tableName]
      );
      const sheetId = insertSheet.rows[0].id;

      // insert column metadata
      for (const colMeta of columnsMeta) {
        await client.query(
          "INSERT INTO sheet_columns(sheet_id, column_name, data_type, sum_of) VALUES($1, $2, $3, $4)",
          [
            sheetId,
            colMeta.name,
            colMeta.type.toLowerCase(),
            colMeta.sum_of ? JSON.stringify(colMeta.sum_of) : null,
          ]
        );
      }

      // create table
      const colDefs = columnsMeta.map(
        (c) => `"${c.name}" ${mapTypeToPostgres(c.type)}`
      );
      const createTableSQL = `CREATE TABLE "${tableName}" (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT NOW(),
        ${colDefs.join(",\n")}
      );`;
      await client.query(createTableSQL);

      if (dataRawRows.length === 0)
        return { sheetId, tableName, rowsInserted: 0 };

      // batch insert with sum computation
      const batchSize = 200;
      let totalInserted = 0;
      for (let b = 0; b < dataRawRows.length; b += batchSize) {
        const batch = dataRawRows.slice(b, b + batchSize);
        const valuePlaceholders = [];
        const values = [];
        let paramIdx = 1;

        for (let rowIdx = 0; rowIdx < batch.length; ++rowIdx) {
          const rawRow = batch[rowIdx];
          const parsedRow = new Array(sanitizedCols.length).fill(null);

          // parse non-sum columns
          for (let ci = 0; ci < sanitizedCols.length; ++ci) {
            if (sumOfMap.hasOwnProperty(ci)) continue;
            const raw = rawRow[ci];
            const t = inferredTypes[ci];
            let parsed = null;
            if (raw === null || raw === undefined || raw === "") parsed = null;
            else if (raw instanceof Date) parsed = raw;
            else {
              const s = String(raw).trim();
              if (t === "integer") {
                const n = Number.parseInt(s, 10);
                parsed = Number.isNaN(n) ? null : n;
              } else if (t === "float") {
                const n = Number.parseFloat(s);
                parsed = Number.isNaN(n) ? null : n;
              } else if (t === "boolean")
                parsed = /^(true|yes|1)$/i.test(s) ? true : false;
              else if (t === "date") {
                const d = new Date(s);
                parsed = isNaN(d.getTime()) ? null : d;
              } else parsed = s;
            }
            parsedRow[ci] = parsed;
          }

          // compute sum columns
          for (const [sumColIdxStr, srcIdxArr] of Object.entries(
            sumSourcesIndices
          )) {
            const sumColIdx = Number(sumColIdxStr);
            let sum = 0;
            for (const srcIdx of srcIdxArr) {
              const val = parsedRow[srcIdx];
              const numeric =
                val === null || val === undefined || val === ""
                  ? 0
                  : Number(val);
              if (Number.isNaN(numeric)) {
                throw new Error(
                  `Non-numeric value encountered for sum source at import row ${b + rowIdx + 2} column "${sanitizedCols[srcIdx]}"`
                );
              }
              sum += numeric;
            }
            parsedRow[sumColIdx] = sum;
          }

          // build placeholders
          const rowPlaceholders = [];
          for (let colIdx = 0; colIdx < sanitizedCols.length; ++colIdx) {
            values.push(parsedRow[colIdx]);
            rowPlaceholders.push(`$${paramIdx++}`);
          }
          valuePlaceholders.push(`(${rowPlaceholders.join(",")})`);
        }

        const insertSQL = `INSERT INTO "${tableName}" (${sanitizedCols.map((c) => `"${c}"`).join(",")}) VALUES ${valuePlaceholders.join(",")};`;
        await client.query(insertSQL, values);
        totalInserted += batch.length;
      }

      return { sheetId, tableName, rowsInserted: totalInserted };
    });

    res.json({
      message: "Excel imported (with sum detection)",
      sheetId: result.sheetId,
      tableName: result.tableName,
      rowsInserted: result.rowsInserted,
    });
  } catch (err) {
    console.error("Error in upload-excel:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------- Graceful shutdown --------------------
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const server = app.listen(PORT, () => {
  console.log(`Sheet backend running on port ${PORT}`);
});

const shutDown = async () => {
  console.log("Shutting down server...");
  server.close(async () => {
    try {
      console.log("Closing DB pool...");
      await pool.end();
      console.log("DB pool closed. Exiting.");
      process.exit(0);
    } catch (err) {
      console.error("Error shutting down:", err);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.warn("Forcing shutdown after timeout");
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
