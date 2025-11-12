// src/app.js
const express = require("express");
const bodyParser = require("body-parser");
const sheetsRouter = require("./routes/sheetRoutes.js");
const pool = require("./db.js");

const app = express();
app.use(bodyParser.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Mount API routes
app.use("/", sheetsRouter);

// simple health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const server = app.listen(PORT, () =>
  console.log(`Sheet backend running on port ${PORT}`)
);

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
