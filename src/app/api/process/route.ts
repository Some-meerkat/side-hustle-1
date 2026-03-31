import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-3-haiku-20240307";

async function ask(system: string, user: string, maxTokens = 4096): Promise<string> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return message.content[0].type === "text" ? message.content[0].text : "";
}

function extractJson(raw: string): string {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? match[0] : cleaned;
}

// ─── PASS 1: Classification ──────────────────────────────────────

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

// ─── PASS 2: Combined Output ─────────────────────────────────────

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

// ─── Main handler ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { text, metadata } = await req.json();

    if (!text) {
      return NextResponse.json(
        { error: "No text content provided" },
        { status: 400 }
      );
    }

    const metaPrefix = metadata
      ? `[Source metadata] Title: ${metadata.title || "unknown"} | Author: ${metadata.author || "unknown"} | Type: ${metadata.type || "unknown"} | URL: ${metadata.url || "unknown"} | Date: ${metadata.date || "unknown"}\n\n`
      : "";
    const fullText = metaPrefix + text;

    // PASS 1: Classify (small — 2k chars, 512 tokens)
    const planRaw = await ask(
      CLASSIFY_SYSTEM,
      `Analyze this content and classify it.\n\nContent (first 2000 chars):\n${fullText.slice(0, 2000)}`,
      512
    );

    let plan: string;
    try {
      plan = JSON.stringify(JSON.parse(extractJson(planRaw)), null, 2);
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

    let knowledge: Record<string, unknown> = {};
    try {
      knowledge = JSON.parse(extractJson(jsonMatch?.[1] || "{}"));
    } catch {
      knowledge = { error: "Failed to parse JSON knowledge block", raw: (jsonMatch?.[1] || "").slice(0, 500) };
    }

    let confidence: Record<string, unknown> = {
      score: 0,
      rating: "Unknown",
      reasoning: "Failed to parse confidence output",
      improvements: [],
    };
    try {
      confidence = JSON.parse(extractJson(confidenceMatch?.[1] || "{}"));
    } catch {
      // keep defaults
    }

    let parsedPlan: Record<string, unknown> = {};
    try { parsedPlan = JSON.parse(plan); } catch { /* ignore */ }

    return NextResponse.json({ markdown, knowledge, confidence, plan: parsedPlan });
  } catch (error) {
    console.error("Processing error:", error);
    return NextResponse.json(
      { error: "Failed to process content with Claude" },
      { status: 500 }
    );
  }
}
