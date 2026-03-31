import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json(
        { error: "No text content provided" },
        { status: 400 }
      );
    }

    const message = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `You are an expert at restructuring unstructured content into agent-readable formats. Analyze the following content and produce three outputs.

**Output 1: Structured Markdown**
Restructure the content into clean, semantic markdown. Use proper heading hierarchy (h1-h4), bullet points, numbered lists, tables where appropriate, bold for key terms, and blockquotes for important callouts. Make it scannable and well-organized. Preserve all important information but improve the structure dramatically.

**Output 2: JSON Knowledge Block**
Create a JSON object that summarizes the content with these fields:
- "title": string — the inferred title or topic
- "summary": string — 2-3 sentence summary
- "entities": array of { "name": string, "type": string, "description": string } — key people, orgs, products, concepts
- "facts": array of strings — key factual claims or data points
- "relationships": array of { "subject": string, "predicate": string, "object": string } — key relationships between entities
- "topics": array of strings — main topics covered
- "metadata": { "content_type": string, "language": string, "estimated_word_count": number, "domain": string }

**Output 3: Confidence Score**
Rate from 0-100 how well-structured the ORIGINAL content was (before your restructuring). Provide:
- "score": number (0-100)
- "rating": string (one of: "Excellent", "Good", "Fair", "Poor", "Very Poor")
- "reasoning": string — 2-3 sentences explaining the score
- "improvements": array of strings — what was wrong with the original structure

Respond with EXACTLY this format (no other text):
===MARKDOWN===
(your structured markdown here)
===JSON===
(your JSON knowledge block here)
===CONFIDENCE===
(your confidence JSON here)

Content to analyze:
${text.slice(0, 80000)}`,
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Parse the three sections
    const markdownMatch = responseText.match(
      /===MARKDOWN===([\s\S]*?)===JSON===/
    );
    const jsonMatch = responseText.match(
      /===JSON===([\s\S]*?)===CONFIDENCE===/
    );
    const confidenceMatch = responseText.match(/===CONFIDENCE===([\s\S]*?)$/);

    const markdown = markdownMatch?.[1]?.trim() || "Failed to generate markdown output.";

    let knowledge = {};
    try {
      const jsonStr = jsonMatch?.[1]?.trim() || "{}";
      const cleaned = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      knowledge = JSON.parse(cleaned);
    } catch {
      knowledge = { error: "Failed to parse JSON knowledge block" };
    }

    let confidence = { score: 0, rating: "Unknown", reasoning: "Failed to parse", improvements: [] };
    try {
      const confStr = confidenceMatch?.[1]?.trim() || "{}";
      const cleaned = confStr.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      confidence = JSON.parse(cleaned);
    } catch {
      // keep defaults
    }

    return NextResponse.json({ markdown, knowledge, confidence });
  } catch (error) {
    console.error("Processing error:", error);
    return NextResponse.json(
      { error: "Failed to process content with Claude" },
      { status: 500 }
    );
  }
}
