// src/app.js
// at top of file (only load dotenv for local dev)
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

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

const rawPort = process.env.PORT ?? process.env.WEBSITE_PORT ?? "4000";

// detect Windows named pipe like \\.\pipe\...  OR unix socket path starting with '/'
const isPipe = (p) =>
  typeof p === "string" && (p.startsWith("\\\\.\\pipe\\") || p.startsWith("/"));

let port;
if (isPipe(rawPort)) {
  port = rawPort; // pass the pipe string directly to listen()
} else {
  const parsed = Number.parseInt(rawPort, 10);
  port =
    Number.isFinite(parsed) && parsed > 0 && parsed < 65536 ? parsed : 4000;
}

console.log(
  `Starting app. NODE_ENV=${process.env.NODE_ENV || "undefined"} PORT env: ${process.env.PORT} => using ${typeof port === "string" ? "pipe" : "port"} ${port}`
);

const server = app.listen(port, () =>
  console.log("Sheet backend running on", port)
);

// const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
// const server = app.listen(PORT, () =>
//   console.log(`Sheet backend running on port ${PORT}`)
// );

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
