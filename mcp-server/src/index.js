#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { processContent, extractFromUrl } from "./pipeline.js";
import fs from "fs";
import mammoth from "mammoth";

const server = new McpServer({
  name: "agent-readable",
  version: "1.0.0",
});

// ─── Tool: Process URL ───────────────────────────────────────────

server.tool(
  "process_url",
  "Convert a URL into agent-readable structured output: clean markdown, JSON knowledge graph, and confidence score",
  {
    url: z.string().url().describe("The URL to process"),
  },
  async ({ url }) => {
    try {
      const { text, metadata } = await extractFromUrl(url);
      const result = await processContent(text, metadata);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: Process Text ──────────────────────────────────────────

server.tool(
  "process_text",
  "Convert raw text into agent-readable structured output: clean markdown, JSON knowledge graph, and confidence score",
  {
    text: z.string().min(50).describe("The text content to process (min 50 chars)"),
    title: z.string().optional().describe("Optional title for context"),
  },
  async ({ text, title }) => {
    try {
      const metadata = title ? { title, url: "", author: "", type: "", description: "" } : null;
      const result = await processContent(text, metadata);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: Process File ──────────────────────────────────────────

server.tool(
  "process_file",
  "Convert a local file (PDF, Word, TXT, MD) into agent-readable structured output",
  {
    file_path: z.string().describe("Absolute path to the file"),
  },
  async ({ file_path }) => {
    try {
      if (!fs.existsSync(file_path)) {
        throw new Error(`File not found: ${file_path}`);
      }

      const name = file_path.toLowerCase();
      const buffer = fs.readFileSync(file_path);
      let text = "";

      if (name.endsWith(".pdf")) {
        const pdf = (await import("pdf-parse")).default;
        const data = await pdf(buffer);
        text = data.text;
      } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } else if (name.endsWith(".txt") || name.endsWith(".md")) {
        text = buffer.toString("utf-8");
      } else {
        throw new Error("Supported formats: .pdf, .docx, .doc, .txt, .md");
      }

      if (text.trim().length < 20) {
        throw new Error("Not enough text extracted from file");
      }

      const result = await processContent(text.trim().slice(0, 100000));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: Extract Only (no AI processing) ───────────────────────

server.tool(
  "extract_url",
  "Extract structured text from a URL without AI processing — useful for feeding into your own prompts",
  {
    url: z.string().url().describe("The URL to extract text from"),
  },
  async ({ url }) => {
    try {
      const { text, metadata } = await extractFromUrl(url);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ metadata, text: text.slice(0, 50000) }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── Start ───────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
