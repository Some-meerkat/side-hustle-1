import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-3-haiku-20240307";

// ─── Helper ──────────────────────────────────────────────────────

async function ask(system, user, maxTokens = 4096) {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return message.content[0]?.type === "text" ? message.content[0].text : "";
}

function cleanJson(raw) {
  let cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) return match[0];
  return cleaned;
}

// ─── System Prompts ──────────────────────────────────────────────

const CLASSIFY_SYSTEM = `You are a content analysis expert. Classify and plan the extraction of content.
Respond with valid JSON only — no other text, no markdown fences. Schema:
{
  "content_type": "article"|"documentation"|"research_paper"|"landing_page"|"blog_post"|"legal_document"|"product_page"|"reference"|"tutorial"|"news"|"other",
  "domain": string,
  "audience": "general"|"technical"|"academic"|"business"|"developer",
  "language": string,
  "estimated_word_count": number,
  "key_sections": [string],
  "extraction_notes": string
}`;

const PROCESS_SYSTEM = `You are an expert at restructuring unstructured content into agent-readable formats. You have been given a content classification to guide your work.

Produce ALL THREE outputs below in a single response.

**Output 1: Structured Markdown**
Restructure the content into clean, semantic markdown:
- Single H1 for title, H2 for major sections, H3-H4 for subsections
- Bullet lists for unordered items, numbered for sequences/steps
- Tables for comparative/tabular data
- **Bold** for key terms on first appearance only
- > blockquotes for critical warnings, important callouts, notable quotes
- \`code\` for technical terms, commands, file names
- Remove marketing fluff, navigation remnants, social media links
- Preserve all factual information
- Do NOT wrap in markdown fences — output raw markdown

**Output 2: JSON Knowledge Block**
Extract a knowledge graph using chain-of-thought: first identify specific, nameable entities, then extract verifiable facts with numbers/dates/names, then map relationships between named entities.
JSON schema (valid JSON only, no fences):
{"title": string, "summary": string (2-3 factual sentences), "entities": [{"name": string, "type": "person"|"organization"|"product"|"concept"|"technology"|"place"|"event"|"metric"|"regulation"|"publication", "description": string}], "facts": [string], "relationships": [{"subject": string, "predicate": string, "object": string}], "topics": [string], "metadata": {"content_type": string, "language": string, "estimated_word_count": number, "domain": string, "source_quality": "primary"|"secondary"|"tertiary"}}

**Output 3: Confidence Score**
Score the ORIGINAL content (before restructuring) on 5 dimensions, each 0-20 (total 0-100):
1. Heading Hierarchy: Proper nested headings?
2. Information Architecture: Logical organization?
3. Scanability: Lists, tables, bold terms, clear sections?
4. Signal-to-Noise: Filler, marketing fluff, repetition?
5. Machine Readability: Can AI parse effectively?
JSON schema (valid JSON only, no fences):
{"score": number, "rating": "Excellent"|"Good"|"Fair"|"Poor"|"Very Poor", "dimensions": {"heading_hierarchy": {"score": number, "note": string}, "information_architecture": {"score": number, "note": string}, "scanability": {"score": number, "note": string}, "signal_to_noise": {"score": number, "note": string}, "machine_readability": {"score": number, "note": string}}, "reasoning": string, "improvements": [string]}

Respond with EXACTLY this format (no other text):
===MARKDOWN===
(structured markdown)
===JSON===
(knowledge block JSON)
===CONFIDENCE===
(confidence score JSON)`;

// ─── URL Content Extraction ──────────────────────────────────────

export async function extractFromUrl(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AgentReadable/1.0)",
    },
  });

  if (!response.ok) throw new Error(`Failed to fetch URL: ${response.status}`);
  const html = await response.text();

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const ogTitleMatch = html.match(/property="og:title"\s+content="([^"]*)"/i);
  const ogDescMatch = html.match(/property="og:description"\s+content="([^"]*)"/i);
  const ogTypeMatch = html.match(/property="og:type"\s+content="([^"]*)"/i);
  const authorMatch = html.match(/name="author"\s+content="([^"]*)"/i);

  const metadata = {
    title: ogTitleMatch?.[1] || titleMatch?.[1]?.trim() || "",
    description: ogDescMatch?.[1] || "",
    type: ogTypeMatch?.[1] || "",
    author: authorMatch?.[1] || "",
    url,
  };

  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n[H${n}] ${t}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n[LI] $1")
    .replace(/<ul[^>]*>/gi, "\n[LIST]").replace(/<\/ul>/gi, "\n[/LIST]")
    .replace(/<ol[^>]*>/gi, "\n[ORDERED]").replace(/<\/ol>/gi, "\n[/ORDERED]")
    .replace(/<table[^>]*>/gi, "\n[TABLE]").replace(/<\/table>/gi, "\n[/TABLE]")
    .replace(/<tr[^>]*>/gi, "\n[ROW]").replace(/<\/tr>/gi, "")
    .replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, " [TH]$1[/TH] ")
    .replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, " [TD]$1[/TD] ")
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*")
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "\n[QUOTE] $1 [/QUOTE]\n")
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "\n[CODE]\n$1\n[/CODE]\n")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<p[^>]*>/gi, "\n\n").replace(/<\/p>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 [$1]")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 100000);

  if (text.length < 50) throw new Error("Not enough content extracted");

  return { text, metadata };
}

// ─── 2-Pass Pipeline ─────────────────────────────────────────────

export async function processContent(text, metadata = null) {
  const metaPrefix = metadata
    ? `[Source metadata] Title: ${metadata.title || "unknown"} | Author: ${metadata.author || "unknown"} | Type: ${metadata.type || "unknown"} | URL: ${metadata.url || "unknown"}\n\n`
    : "";
  const fullText = metaPrefix + text;

  // PASS 1: Classify (small, fast — only 2k chars)
  const planRaw = await ask(
    CLASSIFY_SYSTEM,
    `Analyze this content and classify it.\n\nContent (first 2000 chars):\n${fullText.slice(0, 2000)}`,
    512
  );

  let plan;
  try {
    plan = JSON.stringify(JSON.parse(cleanJson(planRaw)), null, 2);
  } catch {
    plan = planRaw;
  }

  // PASS 2: All outputs in one call, guided by classification
  const resultRaw = await ask(
    PROCESS_SYSTEM,
    `Content classification:\n${plan}\n\nContent to process:\n${fullText.slice(0, 30000)}`
  );

  // Parse the three sections
  const markdownMatch = resultRaw.match(/===MARKDOWN===([\s\S]*?)===JSON===/);
  const jsonMatch = resultRaw.match(/===JSON===([\s\S]*?)===CONFIDENCE===/);
  const confidenceMatch = resultRaw.match(/===CONFIDENCE===([\s\S]*?)$/);

  const markdown = markdownMatch?.[1]?.trim() || resultRaw.trim() || "Failed to generate markdown.";

  let knowledge = {};
  try {
    knowledge = JSON.parse(cleanJson(jsonMatch?.[1] || "{}"));
  } catch {
    knowledge = { error: "Failed to parse knowledge block", raw: (jsonMatch?.[1] || "").slice(0, 300) };
  }

  let confidence = { score: 0, rating: "Unknown", reasoning: "Failed to parse", improvements: [] };
  try {
    confidence = JSON.parse(cleanJson(confidenceMatch?.[1] || "{}"));
  } catch {
    // keep defaults
  }

  let classification = {};
  try {
    classification = JSON.parse(cleanJson(plan));
  } catch {
    classification = { raw: plan };
  }

  return { markdown, knowledge, confidence, classification };
}

// ─── Batch Processing ────────────────────────────────────────────

export async function processBatch(items) {
  const results = await Promise.allSettled(
    items.map(async (item) => {
      const start = Date.now();
      try {
        let text, metadata;
        if (item.url) {
          const extracted = await extractFromUrl(item.url);
          text = extracted.text;
          metadata = extracted.metadata;
        } else if (item.text) {
          text = item.text;
          metadata = item.metadata || null;
        } else {
          throw new Error("Each item must have a 'url' or 'text' field");
        }

        const result = await processContent(text, metadata);
        return {
          input: item.url || "(direct text)",
          status: "success",
          duration_ms: Date.now() - start,
          ...result,
        };
      } catch (err) {
        return {
          input: item.url || "(direct text)",
          status: "error",
          duration_ms: Date.now() - start,
          error: err.message,
        };
      }
    })
  );

  return results.map((r) => (r.status === "fulfilled" ? r.value : { status: "error", error: r.reason?.message }));
}
