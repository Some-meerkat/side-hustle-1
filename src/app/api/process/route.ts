import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-3-haiku-20240307";

// Helper to call Claude
async function ask(
  system: string,
  user: string,
  maxTokens = 4096
): Promise<string> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return message.content[0].type === "text" ? message.content[0].text : "";
}

// ─── PASS 1: Classification & Planning ───────────────────────────

const CLASSIFY_SYSTEM = `You are a content analysis expert. Your job is to classify and plan the extraction of content.

You MUST respond with valid JSON only — no other text, no markdown fences. Use this exact schema:
{
  "content_type": "article" | "documentation" | "research_paper" | "landing_page" | "blog_post" | "legal_document" | "product_page" | "reference" | "tutorial" | "news" | "other",
  "domain": string (e.g. "technology", "finance", "science", "law", "education"),
  "audience": "general" | "technical" | "academic" | "business" | "developer",
  "language": string,
  "estimated_word_count": number,
  "key_sections": [string] (list the main sections/topics you identified),
  "extraction_notes": string (what to emphasize, what to deprioritize, any structural quirks)
}`;

function classifyPrompt(text: string): string {
  return `Analyze this content and classify it. Identify its type, domain, audience, main sections, and note any structural issues or emphasis points.

Content (first 5000 chars):
${text.slice(0, 5000)}`;
}

// ─── PASS 2: Structured Markdown ─────────────────────────────────

const MARKDOWN_SYSTEM = `You are an expert technical writer who restructures content into clean, agent-readable markdown.

Rules:
- Use a single H1 for the title, H2 for major sections, H3-H4 for subsections
- Every section must have content — no empty headings
- Use bullet lists for unordered items, numbered lists for sequences/steps
- Use tables for comparative or tabular data (at least 2 columns, at least 2 rows)
- Use **bold** for key terms on their first appearance only
- Use > blockquotes for critical warnings, important callouts, or notable quotes
- Use \`code\` for technical terms, commands, file names
- Remove all marketing fluff, cookie banners, navigation remnants, social media links
- Preserve all factual information, data points, and quotes
- If content has structural markers like [H1], [H2], [LIST], [TABLE], use them as hints for the original structure
- Write in the same language as the original content
- Do NOT wrap your response in markdown fences — just output raw markdown`;

function markdownPrompt(text: string, plan: string): string {
  return `Here is the content analysis plan:
${plan}

Using this plan as your guide, restructure the following content into clean, semantic markdown. Prioritize the sections and emphasis noted in the plan.

Content:
${text.slice(0, 70000)}`;
}

// ─── PASS 3: Knowledge Graph Extraction ──────────────────────────

const KNOWLEDGE_SYSTEM = `You are a knowledge extraction specialist. You extract structured knowledge from content using chain-of-thought reasoning.

Process:
1. First, identify candidate entities. For each, ask: "Is this a specific, nameable thing (person, org, product, concept, place, event, metric)?" Only include if yes.
2. For each entity, determine its type from: person, organization, product, concept, technology, place, event, metric, regulation, publication.
3. Extract factual claims — statements that are verifiable or data-backed. Exclude opinions, marketing language, and vague statements.
4. Identify relationships — only extract relationships where both subject and object are named entities from your entity list.
5. Determine topics — use specific terms, not generic ones. "React server components" not "web development".

You MUST respond with valid JSON only — no other text, no markdown fences. Use this schema:
{
  "title": string,
  "summary": string (2-3 sentences, factual, no marketing language),
  "entities": [{ "name": string, "type": string, "description": string (one sentence, factual) }],
  "facts": [string] (verifiable claims with specifics — numbers, dates, names),
  "relationships": [{ "subject": string, "predicate": string, "object": string }],
  "topics": [string] (specific, not generic),
  "metadata": {
    "content_type": string,
    "language": string,
    "estimated_word_count": number,
    "domain": string,
    "source_quality": "primary" | "secondary" | "tertiary"
  }
}`;

function knowledgePrompt(text: string, plan: string): string {
  return `Content analysis plan:
${plan}

Extract a structured knowledge graph from this content. Think step by step: first identify entities, then verify each is specific and nameable, then extract facts, then relationships.

Content:
${text.slice(0, 70000)}`;
}

// ─── PASS 4: Confidence Scoring ──────────────────────────────────

const CONFIDENCE_SYSTEM = `You are a content structure auditor. You evaluate how well-structured the ORIGINAL content is — before any restructuring.

Score on these 5 dimensions (each 0-20 points, total 0-100):

1. **Heading Hierarchy** (0-20): Does it use headings? Are they properly nested (H1 > H2 > H3)? Are they descriptive?
2. **Information Architecture** (0-20): Is content logically organized? Are related ideas grouped? Is there a clear flow?
3. **Scanability** (0-20): Can a reader quickly find what they need? Are there lists, tables, bold terms, clear sections?
4. **Signal-to-Noise** (0-20): Is there filler content? Marketing fluff? Repeated information? Cookie banners? Navigation remnants in body?
5. **Machine Readability** (0-20): Could an AI agent parse this effectively? Are entities clearly introduced? Are facts stated unambiguously?

You MUST respond with valid JSON only — no other text, no markdown fences. Use this schema:
{
  "score": number (0-100, sum of 5 dimensions),
  "rating": "Excellent" (80-100) | "Good" (60-79) | "Fair" (40-59) | "Poor" (20-39) | "Very Poor" (0-19),
  "dimensions": {
    "heading_hierarchy": { "score": number, "note": string },
    "information_architecture": { "score": number, "note": string },
    "scanability": { "score": number, "note": string },
    "signal_to_noise": { "score": number, "note": string },
    "machine_readability": { "score": number, "note": string }
  },
  "reasoning": string (2-3 sentences overall assessment),
  "improvements": [string] (specific, actionable issues found — not generic advice)
}`;

function confidencePrompt(text: string, plan: string): string {
  return `Content analysis plan:
${plan}

Audit the ORIGINAL content structure below. Score each of the 5 dimensions independently, then sum for the total. Be specific about what works and what doesn't.

Original content:
${text.slice(0, 20000)}`;
}

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

    // Prepend metadata context if available
    const metaPrefix = metadata
      ? `[Source metadata] Title: ${metadata.title || "unknown"} | Author: ${metadata.author || "unknown"} | Type: ${metadata.type || "unknown"} | URL: ${metadata.url || "unknown"} | Date: ${metadata.date || "unknown"}\n\n`
      : "";
    const fullText = metaPrefix + text;

    // Extract first JSON object from a string that may have surrounding text
    function extractJson(raw: string): string {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      return match ? match[0] : cleaned;
    }

    // PASS 1: Classify content and create extraction plan
    const planRaw = await ask(CLASSIFY_SYSTEM, classifyPrompt(fullText), 1024);
    let plan: string;
    try {
      const parsed = JSON.parse(extractJson(planRaw));
      plan = JSON.stringify(parsed, null, 2);
    } catch {
      plan = planRaw;
    }

    // PASS 2, 3, 4: Run in parallel — they all depend on Pass 1 but not each other
    const [markdownRaw, knowledgeRaw, confidenceRaw] = await Promise.all([
      ask(MARKDOWN_SYSTEM, markdownPrompt(fullText, plan)),
      ask(KNOWLEDGE_SYSTEM, knowledgePrompt(fullText, plan)),
      ask(CONFIDENCE_SYSTEM, confidencePrompt(fullText, plan)),
    ]);

    // Parse markdown (raw text, no parsing needed)
    const markdown = markdownRaw.trim() || "Failed to generate markdown output.";

    // Parse knowledge JSON
    let knowledge: Record<string, unknown> = {};
    try {
      knowledge = JSON.parse(extractJson(knowledgeRaw));
    } catch {
      knowledge = { error: "Failed to parse JSON knowledge block", raw: knowledgeRaw.slice(0, 500) };
    }

    // Parse confidence JSON
    let confidence: Record<string, unknown> = {
      score: 0,
      rating: "Unknown",
      reasoning: "Failed to parse confidence output",
      improvements: [],
    };
    try {
      confidence = JSON.parse(extractJson(confidenceRaw));
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
