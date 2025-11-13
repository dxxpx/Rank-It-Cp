// src/routes/sheetsRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("../upload/multer");
const sheets = require("../services/sheetsService");
const ExcelJS = require("exceljs");
const {
  uploadBufferToBlob,
  generateBlobSasUrl,
  DEFAULT_CONTAINER,
} = require("../services/storage_service.js"); // adjust path

function sendError(res, err) {
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  res.status(status).json({ error: err.message });
}

// POST /sheets
router.post("/sheets", async (req, res) => {
  try {
    const result = await sheets.createSheet(req.body);
    res.json({ message: "Sheet created", ...result });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /sheets
router.get("/sheets", async (req, res) => {
  try {
    const includeColumns =
      String(req.query.includeColumns ?? "true").toLowerCase() === "true";
    const limit = req.query.limit ? Number(req.query.limit) : null;
    const offset = req.query.offset ? Number(req.query.offset) : null;
    const rows = await sheets.listSheets({ includeColumns, limit, offset });
    res.json({ sheets: rows });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /sheets/:sheetId/columns
router.get("/sheets/:sheetId/columns", async (req, res) => {
  try {
    const sheetId = Number(req.params.sheetId);
    const client = require("../db");
    const dbClient = await client.connect();
    try {
      const meta = require("../meta");
      const sheetQ = await dbClient.query(
        "SELECT id, name, table_name, created_at FROM sheets WHERE id = $1",
        [sheetId]
      );
      if (!sheetQ.rows.length)
        return res.status(404).json({ error: "Sheet not found" });
      const columns = await meta.getColumnsForSheet(dbClient, sheetId);
      res.json({
        sheetId,
        sheetName: sheetQ.rows[0].name,
        tableName: sheetQ.rows[0].table_name,
        columns: columns.map((c) => ({
          column_name: c.column_name,
          data_type: c.data_type,
          sum_of: c.sum_of,
        })),
      });
    } finally {
      dbClient.release();
    }
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /sheets/:sheetId
router.delete("/sheets/:sheetId", async (req, res) => {
  try {
    const result = await sheets.deleteSheet(Number(req.params.sheetId));
    res.json({
      message: "Sheet deleted successfully",
      deletedSheet: result.sheetName,
      deletedTable: result.tableName,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /sheets/:sheetId/rows
router.post("/sheets/:sheetId/rows", async (req, res) => {
  try {
    const row = await sheets.addRow(
      Number(req.params.sheetId),
      req.body.values || {}
    );
    res.json({ message: "Row added", row });
  } catch (err) {
    sendError(res, err);
  }
});

// PUT /sheets/:sheetId/rows/:rowId
router.put("/sheets/:sheetId/rows/:rowId", async (req, res) => {
  try {
    const row = await sheets.updateRow(
      Number(req.params.sheetId),
      Number(req.params.rowId),
      req.body.values || {}
    );
    res.json({ message: "Row updated", row });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /sheets/:sheetId/rows/:rowId
router.get("/sheets/:sheetId/rows/:rowId", async (req, res) => {
  try {
    const row = await sheets.getRow(
      Number(req.params.sheetId),
      Number(req.params.rowId)
    );
    res.json({ row });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /sheets/:sheetId/export
router.get("/sheets/:sheetId/export", async (req, res) => {
  try {
    const sheetId = Number(req.params.sheetId);
    const { sheetMeta, columns, rows } =
      await sheets.fetchSheetForExport(sheetId);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetMeta.name || `sheet_${sheetId}`);
    const header = columns.map((c) => c.column_name);
    ws.addRow(["id", "created_at", ...header]);
    for (const r of rows) {
      const rowVals = [r.id, r.created_at];
      for (const c of columns) rowVals.push(r[c.column_name]);
      ws.addRow(rowVals);
    }

    const buffer = await wb.xlsx.writeBuffer();
    const friendly = (sheetMeta.name || `sheet_${sheetId}`).replace(
      /[^A-Za-z0-9_\-]/g,
      "_"
    );
    const ts = Date.now();
    const blobName = `${friendly}.xlsx`;
    const containerName =
      process.env.AZURE_STORAGE_CONTAINER || DEFAULT_CONTAINER;
    const blobUrl = await uploadBufferToBlob(buffer, blobName, containerName);
    const sasTtlSeconds = process.env.AZURE_SAS_EXPIRY_SECONDS
      ? Number(process.env.AZURE_SAS_EXPIRY_SECONDS)
      : process.env.AZURE_SAS_TTL_HOURS
        ? Number(process.env.AZURE_SAS_TTL_HOURS) * 3600
        : 3600;
    const { sasUrl, expiresOn } = generateBlobSasUrl(
      containerName,
      blobName,
      sasTtlSeconds
    );

    // Return JSON with download URL
    return res.json({
      message: "Export uploaded to storage",
      downloadUrl: sasUrl,
      expiresOn: expiresOn.toISOString(),
      blobName,
      containerName,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /tables/check?tableName=...
router.get("/tables/check", async (req, res) => {
  try {
    const tableName = req.query.tableName;
    const status = await sheets.checkTableAvailability(tableName);
    res.json({ status });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /sheets/upload-excel
router.post("/sheets/upload-excel", multer.single("file"), async (req, res) => {
  try {
    if (!req.file)
      return res
        .status(400)
        .json({ error: 'No file uploaded (field name must be "file")' });
    const previewFlag =
      (req.body && req.body.preview === "true") ||
      (req.query && req.query.preview === "true");
    const result = await sheets.uploadExcel(req.file.buffer, {
      sheetName: req.body.sheetName,
      worksheet: req.body.worksheet,
      preview: previewFlag,
      sampleSize: req.body.sampleSize,
    });
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
