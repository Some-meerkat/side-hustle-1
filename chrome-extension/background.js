// ─── System prompts for 2-pass pipeline ──────────────────────────

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

// ─── API call helper ─────────────────────────────────────────────

async function askClaude(apiKey, system, userContent, maxTokens = 4096) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || "";
}

function cleanJson(raw) {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? match[0] : cleaned;
}

// ─── Event handlers ──────────────────────────────────────────────

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PROCESS_CONTENT") {
    handleProcess(message.text, sender.tab?.id)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "GET_API_KEY") {
    chrome.storage.sync.get("anthropicApiKey", (data) => {
      sendResponse({ apiKey: data.anthropicApiKey || "" });
    });
    return true;
  }

  if (message.type === "SET_API_KEY") {
    chrome.storage.sync.set({ anthropicApiKey: message.apiKey }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// ─── 2-Pass Pipeline ─────────────────────────────────────────────

async function handleProcess(text, tabId) {
  const { anthropicApiKey } = await chrome.storage.sync.get("anthropicApiKey");
  if (!anthropicApiKey) {
    if (tabId) chrome.sidePanel.open({ tabId });
    return { error: "API key not set. Please add your Anthropic API key in the side panel." };
  }

  if (tabId) {
    chrome.sidePanel.open({ tabId });
    await new Promise((r) => setTimeout(r, 500));
    chrome.runtime.sendMessage({ type: "LOADING" });
  }

  try {
    const content = text.slice(0, 30000);

    // PASS 1: Classify (small — 2k chars)
    const planRaw = await askClaude(
      anthropicApiKey,
      CLASSIFY_SYSTEM,
      `Analyze this content and classify it.\n\nContent (first 2000 chars):\n${content.slice(0, 2000)}`,
      512
    );

    let plan;
    try {
      plan = JSON.stringify(JSON.parse(cleanJson(planRaw)), null, 2);
    } catch {
      plan = planRaw;
    }

    // PASS 2: All outputs in one call
    const resultRaw = await askClaude(
      anthropicApiKey,
      PROCESS_SYSTEM,
      `Content classification:\n${plan}\n\nContent to process:\n${content}`
    );

    // Parse sections
    const markdownMatch = resultRaw.match(/===MARKDOWN===([\s\S]*?)===JSON===/);
    const jsonMatch = resultRaw.match(/===JSON===([\s\S]*?)===CONFIDENCE===/);
    const confidenceMatch = resultRaw.match(/===CONFIDENCE===([\s\S]*?)$/);

    const markdown = markdownMatch?.[1]?.trim() || resultRaw.trim() || "Failed to generate markdown.";

    let knowledge = {};
    try {
      knowledge = JSON.parse(cleanJson(jsonMatch?.[1] || "{}"));
    } catch {
      knowledge = { error: "Failed to parse JSON knowledge block" };
    }

    let confidence = { score: 0, rating: "Unknown", reasoning: "Failed to parse", improvements: [] };
    try {
      confidence = JSON.parse(cleanJson(confidenceMatch?.[1] || "{}"));
    } catch {
      // keep defaults
    }

    const result = { markdown, knowledge, confidence };
    chrome.runtime.sendMessage({ type: "RESULT", data: result });
    return { success: true };
  } catch (err) {
    chrome.runtime.sendMessage({ type: "ERROR", error: err.message });
    return { error: err.message };
  }
}
