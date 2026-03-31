import "dotenv/config";
import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import { processContent, extractFromUrl, processBatch } from "./pipeline.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const PORT = process.env.PORT || 4000;
const API_KEY = process.env.API_KEY;

// ─── Auth middleware ─────────────────────────────────────────────

function authenticate(req, res, next) {
  const key = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
  if (API_KEY && key !== API_KEY) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }
  next();
}

app.use(express.json({ limit: "10mb" }));
app.use(authenticate);

// ─── POST /process — single URL or text ──────────────────────────

app.post("/process", async (req, res) => {
  const start = Date.now();
  try {
    const { url, text, metadata } = req.body;

    if (!url && !text) {
      return res.status(400).json({ error: "Provide 'url' or 'text' in request body" });
    }

    let content, meta;
    if (url) {
      const extracted = await extractFromUrl(url);
      content = extracted.text;
      meta = extracted.metadata;
    } else {
      content = text;
      meta = metadata || null;
    }

    const result = await processContent(content, meta);

    res.json({
      status: "success",
      duration_ms: Date.now() - start,
      input: url || "(direct text)",
      ...result,
    });
  } catch (err) {
    console.error("Process error:", err.message);
    res.status(500).json({ error: err.message, duration_ms: Date.now() - start });
  }
});

// ─── POST /process/batch — multiple URLs/texts ───────────────────

app.post("/process/batch", async (req, res) => {
  const start = Date.now();
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Provide 'items' array with {url} or {text} objects" });
    }

    if (items.length > 10) {
      return res.status(400).json({ error: "Maximum 10 items per batch" });
    }

    const results = await processBatch(items);

    res.json({
      status: "success",
      total: items.length,
      succeeded: results.filter((r) => r.status === "success").length,
      failed: results.filter((r) => r.status === "error").length,
      duration_ms: Date.now() - start,
      results,
    });
  } catch (err) {
    console.error("Batch error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /process/upload — file upload ──────────────────────────

app.post("/process/upload", upload.single("file"), async (req, res) => {
  const start = Date.now();
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const name = req.file.originalname.toLowerCase();
    let text = "";

    if (name.endsWith(".pdf")) {
      const pdf = (await import("pdf-parse")).default;
      const data = await pdf(req.file.buffer);
      text = data.text;
    } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      text = result.value;
    } else if (name.endsWith(".txt") || name.endsWith(".md")) {
      text = req.file.buffer.toString("utf-8");
    } else {
      return res.status(400).json({ error: "Supported formats: .pdf, .docx, .doc, .txt, .md" });
    }

    if (text.trim().length < 20) {
      return res.status(400).json({ error: "Not enough text extracted from file" });
    }

    const result = await processContent(text.trim().slice(0, 100000));

    res.json({
      status: "success",
      duration_ms: Date.now() - start,
      input: req.file.originalname,
      ...result,
    });
  } catch (err) {
    console.error("Upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /process/webhook — async with callback ────────────────

app.post("/process/webhook", async (req, res) => {
  const { url, text, metadata, callback_url } = req.body;

  if (!callback_url) {
    return res.status(400).json({ error: "Provide 'callback_url' for async results" });
  }
  if (!url && !text) {
    return res.status(400).json({ error: "Provide 'url' or 'text'" });
  }

  const jobId = crypto.randomUUID();
  res.json({ status: "accepted", job_id: jobId, message: "Processing started. Results will be sent to callback_url." });

  // Process in background
  (async () => {
    const start = Date.now();
    try {
      let content, meta;
      if (url) {
        const extracted = await extractFromUrl(url);
        content = extracted.text;
        meta = extracted.metadata;
      } else {
        content = text;
        meta = metadata || null;
      }

      const result = await processContent(content, meta);

      await fetch(callback_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          status: "success",
          duration_ms: Date.now() - start,
          input: url || "(direct text)",
          ...result,
        }),
      });
    } catch (err) {
      await fetch(callback_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          status: "error",
          error: err.message,
          duration_ms: Date.now() - start,
        }),
      }).catch(() => {});
    }
  })();
});

// ─── GET /health ─────────────────────────────────────────────────

app.get("/health", (_, res) => {
  res.json({ status: "ok", model: "claude-3-haiku-20240307" });
});

// ─── Start ───────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Agent Readable API running on http://localhost:${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  POST /process          — single URL or text`);
  console.log(`  POST /process/batch    — up to 10 items`);
  console.log(`  POST /process/upload   — file upload (PDF, Word, TXT)`);
  console.log(`  POST /process/webhook  — async with callback`);
  console.log(`  GET  /health           — status check`);
});
