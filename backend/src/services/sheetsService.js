// src/services/sheetsService.js
const ExcelJS = require("exceljs");
const pool = require("../db");
const {
  sanitizeName,
  mapTypeToPostgres,
  parseSumOf,
  withClient,
  isValidTableName,
} = require("../helpers");
const {
  ensureMetaTables,
  getColumnsForSheet,
  getTableName,
} = require("../meta");

// Ensure metadata tables created on module load
ensureMetaTables().catch((err) => {
  console.error("Failed to create metadata tables", err);
  process.exit(1);
});

// Create sheet (table + metadata)
async function createSheet(reqBody) {
  const { sheetName, columns } = reqBody;
  if (!sheetName || !Array.isArray(columns) || columns.length === 0) {
    const err = new Error("sheetName and columns[] are required");
    err.status = 400;
    throw err;
  }

  const safeSheetName = sanitizeName(sheetName);

  return await withClient(async (client) => {
    const tableName = `${safeSheetName}_${Date.now()}`;
    const insertSheet = await client.query(
      "INSERT INTO sheets(name, table_name) VALUES($1, $2) RETURNING id, table_name",
      [sheetName, tableName]
    );
    const sheetId = insertSheet.rows[0].id;

    const colDefs = [];
    for (const col of columns) {
      if (!col.name || !col.type)
        throw new Error("Each column requires name and type");
      const colName = sanitizeName(col.name);
      const sqlType = mapTypeToPostgres(col.type);
      colDefs.push(`"${colName}" ${sqlType}`);
      const sumOf = col.sum_of ? JSON.stringify(parseSumOf(col.sum_of)) : null;
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
}

// Add row (auto sum)
async function addRow(sheetId, valuesObj) {
  if (Number.isNaN(Number(sheetId))) throw new Error("Invalid sheetId");
  return await withClient(async (client) => {
    const tableName = await getTableName(client, sheetId);
    const columns = await getColumnsForSheet(client, sheetId);

    const normalizedInput = {};
    for (const k of Object.keys(valuesObj || {}))
      normalizedInput[sanitizeName(k)] = valuesObj[k];

    const insertCols = [];
    const insertVals = [];
    const placeholders = [];

    // non-sum columns
    for (const col of columns) {
      if (!col.sum_of) {
        const cname = col.column_name;
        insertCols.push(`"${cname}"`);
        insertVals.push(
          normalizedInput.hasOwnProperty(cname) ? normalizedInput[cname] : null
        );
        placeholders.push(`$${insertVals.length}`);
      }
    }
    // sum columns computed
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
          if (isNaN(numeric))
            throw new Error(
              `Value for column "${src}" is not numeric but required for sum column "${cname}"`
            );
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
}

// Update row (recalc sums)
async function updateRow(sheetId, rowId, valuesObj) {
  if (Number.isNaN(Number(sheetId)) || Number.isNaN(Number(rowId)))
    throw new Error("Invalid ids");
  return await withClient(async (client) => {
    const tableName = await getTableName(client, sheetId);
    const columns = await getColumnsForSheet(client, sheetId);

    const existingQ = await client.query(
      `SELECT * FROM "${tableName}" WHERE id=$1`,
      [rowId]
    );
    if (!existingQ.rows.length) throw new Error("Row not found");
    const existingRow = existingQ.rows[0];

    const normalizedInput = {};
    for (const k of Object.keys(valuesObj || {}))
      normalizedInput[sanitizeName(k)] = valuesObj[k];

    const setParts = [];
    const values = [];

    for (const col of columns) {
      if (!col.sum_of) {
        const cname = col.column_name;
        if (normalizedInput.hasOwnProperty(cname)) {
          values.push(normalizedInput[cname]);
          setParts.push(`"${cname}" = $${values.length}`);
        }
      }
    }

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
          if (isNaN(numeric))
            throw new Error(
              `Value for column "${src}" is not numeric but required for sum column "${cname}"`
            );
          sum += numeric;
        }
        values.push(sum);
        setParts.push(`"${cname}" = $${values.length}`);
      }
    }

    if (setParts.length === 0) return existingRow;

    const q = `UPDATE "${tableName}" SET ${setParts.join(", ")} WHERE id=$${values.length + 1} RETURNING *`;
    values.push(rowId);
    const r = await client.query(q, values);
    return r.rows[0];
  });
}

// Get single row
async function getRow(sheetId, rowId) {
  if (Number.isNaN(Number(sheetId)) || Number.isNaN(Number(rowId)))
    throw new Error("Invalid ids");
  const tableName = await getTableName(pool, sheetId);
  const { rows } = await pool.query(
    `SELECT * FROM "${tableName}" WHERE id=$1`,
    [rowId]
  );
  if (!rows.length) throw new Error("Row not found");
  return rows[0];
}

// Export sheet to Excel (returns workbook buffer stream via response in controller)
async function fetchSheetForExport(sheetId) {
  const { rows: sheetRows } = await pool.query(
    "SELECT * FROM sheets WHERE id=$1",
    [sheetId]
  );
  if (!sheetRows.length) throw new Error("Sheet not found");
  const sheetMeta = sheetRows[0];
  const client = await pool.connect();
  try {
    const columns = await getColumnsForSheet(client, sheetId);
    const tableName = sheetMeta.table_name;
    const { rows } = await client.query(
      `SELECT * FROM "${tableName}" ORDER BY id`
    );
    return { sheetMeta, columns, rows };
  } finally {
    client.release();
  }
}

// List sheets with optional columns
async function listSheets({
  includeColumns = true,
  limit = null,
  offset = null,
} = {}) {
  if (includeColumns) {
    const q = `
      SELECT
        s.id,
        s.name,
        s.table_name,
        s.created_at,
        COALESCE(json_agg(
          json_build_object(
            'id', sc.id,
            'column_name', sc.column_name,
            'data_type', sc.data_type,
            'sum_of', CASE WHEN sc.sum_of IS NOT NULL THEN sc.sum_of::json ELSE NULL END,
            'created_at', sc.created_at
          )
        ) FILTER (WHERE sc.id IS NOT NULL), '[]') AS columns
      FROM sheets s
      LEFT JOIN sheet_columns sc ON sc.sheet_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
      ${limit ? `LIMIT ${Number(limit)}` : ""}
      ${offset ? `OFFSET ${Number(offset)}` : ""};
    `;
    const { rows } = await pool.query(q);
    return rows;
  } else {
    const q2 = `
      SELECT id, name, table_name, created_at
      FROM sheets
      ORDER BY created_at DESC
      ${limit ? `LIMIT ${Number(limit)}` : ""}
      ${offset ? `OFFSET ${Number(offset)}` : ""};
    `;
    const { rows } = await pool.query(q2);
    return rows;
  }
}

// Check if a Postgres table exists
async function checkTableAvailability(tableNameRaw) {
  if (!tableNameRaw || typeof tableNameRaw !== "string") {
    const err = new Error("tableName query parameter is required");
    err.status = 400;
    throw err;
  }
  const tableName = sanitizeName(tableNameRaw.trim());
  if (!isValidTableName(tableName)) {
    const err = new Error(
      "Invalid table name. Use letters, numbers and underscores, start with letter or underscore."
    );
    err.status = 400;
    throw err;
  }
  const q = `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS present;
  `;
  const { rows } = await pool.query(q, [tableName]);
  return rows[0] && rows[0].present ? "Already taken" : "Available";
}

// Delete sheet (metadata + drop table)
async function deleteSheet(sheetId) {
  if (Number.isNaN(Number(sheetId))) throw new Error("Invalid sheetId");
  return await withClient(async (client) => {
    const { rows } = await client.query(
      "SELECT table_name, name FROM sheets WHERE id = $1",
      [sheetId]
    );
    if (!rows.length) throw new Error("Sheet not found");
    const { table_name: tableName, name: sheetName } = rows[0];
    await client.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);
    await client.query("DELETE FROM sheets WHERE id = $1", [sheetId]);
    return { sheetName, tableName };
  });
}

// Upload Excel handler (with preview & sum detection) - returns preview or import result
async function uploadExcel(fileBuffer, options = {}) {
  // options: { sheetName, worksheet, preview: bool, sampleSize }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const worksheet = options.worksheet
    ? workbook.getWorksheet(options.worksheet)
    : workbook.worksheets[0];
  if (!worksheet) {
    const err = new Error("Worksheet not found in uploaded file");
    err.status = 400;
    throw err;
  }

  // read rows w/out empty rows
  const rawRows = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    rawRows.push(row.values.slice(1));
  });

  if (!rawRows.length) {
    const err = new Error("Worksheet is empty");
    err.status = 400;
    throw err;
  }

  // header detection + sumOf detection (header format: name__sum(a,b,c))
  const headerRaw = rawRows[0].map((h) =>
    h === null || h === undefined ? "" : String(h).trim()
  );
  const sumRegex = /^(.+?)__sum\((.+?)\)$/i;
  const sanitizedCols = [];
  const sumOfMap = {};
  const seen = new Map();

  for (let i = 0; i < headerRaw.length; ++i) {
    let headerCell = headerRaw[i] || `col${i + 1}`;
    const m = headerCell.match(sumRegex);
    let baseName = headerCell;
    let isSum = false;
    let sumSources = null;
    if (m) {
      isSum = true;
      baseName = m[1].trim();
      const sourcesRaw = m[2]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!sourcesRaw.length) {
        const err = new Error(
          `Invalid sum definition in header "${headerCell}"`
        );
        err.status = 400;
        throw err;
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

  // prepare data rows (skip header)
  const dataRawRows = rawRows.slice(1).map((r) => {
    const arr = [];
    for (let i = 0; i < sanitizedCols.length; ++i)
      arr.push(i < r.length ? r[i] : null);
    return arr;
  });

  // type inference function (same as previous)
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

  // validate sum sources
  const colIndexByName = {};
  sanitizedCols.forEach((c, i) => (colIndexByName[c] = i));
  for (const [sumColIdxStr, sources] of Object.entries(sumOfMap)) {
    for (const src of sources) {
      if (!colIndexByName.hasOwnProperty(src)) {
        const err = new Error(
          `Sum column "${sanitizedCols[Number(sumColIdxStr)]}" references unknown source column "${src}"`
        );
        err.status = 400;
        throw err;
      }
    }
  }

  // preview mode
  if (options.preview) {
    const sampleSize = options.sampleSize
      ? Math.max(1, Math.min(100, Number(options.sampleSize)))
      : 10;
    const sampleRows = [];
    const warnings = [];
    const max = Math.min(sampleSize, dataRawRows.length);

    function parseAndComputeRow(rawRow, rowNumber = null) {
      const parsedRow = new Array(sanitizedCols.length).fill(null);
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
      for (const [sumColIdxStr, sources] of Object.entries(sumOfMap)) {
        const sumColIdx = Number(sumColIdxStr);
        let sum = 0;
        for (const srcName of sources) {
          const srcIdx = colIndexByName[srcName];
          const val = parsedRow[srcIdx];
          const numeric =
            val === null || val === undefined || val === "" ? 0 : Number(val);
          if (Number.isNaN(numeric)) {
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

    for (let i = 0; i < max; ++i) {
      const result = parseAndComputeRow(dataRawRows[i], i + 2);
      if (result.error) warnings.push(result.error);
      sampleRows.push(result.row);
    }

    return {
      preview: true,
      sheetName: options.sheetName || `import_${Date.now()}`,
      worksheet: worksheet.name,
      detectedRows: dataRawRows.length,
      columns: columnsMeta,
      sanitizedCols,
      inferredTypes,
      sampleRows,
      warnings,
    };
  }

  // Actual import: create table and bulk insert
  return await withClient(async (client) => {
    const safeSheetName = sanitizeName(
      options.sheetName || `import_${Date.now()}`
    );
    const tableName = `${safeSheetName}_${Date.now()}`;
    const insertSheet = await client.query(
      "INSERT INTO sheets(name, table_name) VALUES($1, $2) RETURNING id",
      [options.sheetName || tableName, tableName]
    );
    const sheetId = insertSheet.rows[0].id;

    for (const col of columnsMeta) {
      await client.query(
        "INSERT INTO sheet_columns(sheet_id, column_name, data_type, sum_of) VALUES($1, $2, $3, $4)",
        [
          sheetId,
          col.name,
          col.type.toLowerCase(),
          col.sum_of ? JSON.stringify(col.sum_of) : null,
        ]
      );
    }

    const colDefs = columnsMeta.map(
      (c) => `"${c.name}" ${mapTypeToPostgres(c.type)}`
    );
    await client.query(
      `CREATE TABLE "${tableName}" ( id SERIAL PRIMARY KEY, created_at TIMESTAMP DEFAULT NOW(), ${colDefs.join(",\n")} );`
    );

    if (dataRawRows.length === 0)
      return { sheetId, tableName, rowsInserted: 0 };

    // precompute sum source indices
    const sumSourcesIndices = {};
    for (const [sumColIdxStr, sources] of Object.entries(sumOfMap)) {
      const sumColIdx = Number(sumColIdxStr);
      sumSourcesIndices[sumColIdx] = sources.map((s) => colIndexByName[s]);
    }

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

        for (const [sumColIdxStr, srcIdxArr] of Object.entries(
          sumSourcesIndices
        )) {
          const sumColIdx = Number(sumColIdxStr);
          let sum = 0;
          for (const srcIdx of srcIdxArr) {
            const val = parsedRow[srcIdx];
            const numeric =
              val === null || val === undefined || val === "" ? 0 : Number(val);
            if (Number.isNaN(numeric)) {
              throw new Error(
                `Non-numeric value encountered for sum source at import row ${b + rowIdx + 2} column "${sanitizedCols[srcIdx]}"`
              );
            }
            sum += numeric;
          }
          parsedRow[sumColIdx] = sum;
        }

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
}

module.exports = {
  createSheet,
  addRow,
  updateRow,
  getRow,
  fetchSheetForExport,
  listSheets,
  checkTableAvailability,
  deleteSheet,
  uploadExcel,
};
