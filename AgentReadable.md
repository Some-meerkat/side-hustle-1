# Agent Readable

A Next.js web app that converts unstructured content (URLs, PDFs, Word documents) into agent-readable output using Claude claude-sonnet-4-6.

## What It Does

Users paste a URL or upload a PDF/Word document. The app sends the extracted content to the Anthropic API, which restructures it into three outputs:

1. **Structured Markdown** — Clean markdown with semantic hierarchy (headings, lists, tables)
2. **JSON Knowledge Block** — Summarized key entities, facts, relationships, and metadata
3. **Confidence Score** — How well-structured the original content was (0-100), with reasoning

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Styling**: Tailwind CSS
- **AI**: Anthropic Claude claude-sonnet-4-6 via `@anthropic-ai/sdk`
- **File Parsing**: `pdf-parse` (PDFs), `mammoth` (Word docs)
- **Markdown Rendering**: `react-markdown`

## Architecture

```
src/
  app/
    page.tsx          — Main UI (upload, tabs, output display)
    layout.tsx        — Root layout with metadata
    globals.css       — Global styles
    api/
      process/
        route.ts      — API route: receives content, calls Claude, returns structured output
      extract/
        route.ts      — API route: extracts text from uploaded files (PDF/Word)
      fetch-url/
        route.ts      — API route: fetches and extracts text from a URL
  components/
    FileUpload.tsx    — Drag-and-drop file upload component
    OutputTabs.tsx    — Tabbed output display (Markdown, JSON, Confidence)
    MarkdownView.tsx  — Renders structured markdown
    JsonView.tsx      — Renders JSON knowledge block
    ConfidenceView.tsx — Renders confidence score with visual gauge
```

## Setup

1. Clone the repo
2. `npm install`
3. Create `.env.local` with `ANTHROPIC_API_KEY=your_key`
4. `npm run dev`

## Environment Variables

- `ANTHROPIC_API_KEY` — Required. Your Anthropic API key for Claude access.
