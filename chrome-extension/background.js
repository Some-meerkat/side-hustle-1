// ─── System prompts for multi-pass pipeline ─────────────────────

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

const MARKDOWN_SYSTEM = `You are an expert technical writer who restructures content into clean, agent-readable markdown.
Rules:
- Single H1 for title, H2 for major sections, H3-H4 for subsections
- Bullet lists for unordered items, numbered for sequences/steps
- Tables for comparative/tabular data
- **Bold** for key terms on first appearance only
- > blockquotes for critical warnings, important callouts, notable quotes
- \`code\` for technical terms, commands, file names
- Remove marketing fluff, navigation remnants, social media links
- Preserve all factual information
- Do NOT wrap response in markdown fences — output raw markdown`;

const KNOWLEDGE_SYSTEM = `You are a knowledge extraction specialist using chain-of-thought reasoning.
Process: 1) Identify candidate entities — only include specific, nameable things. 2) Classify type: person, organization, product, concept, technology, place, event, metric, regulation, publication. 3) Extract verifiable factual claims with specifics. 4) Identify relationships where both subject and object are named entities. 5) List specific topics.
Respond with valid JSON only — no markdown fences. Schema:
{
  "title": string,
  "summary": string (2-3 factual sentences),
  "entities": [{"name": string, "type": string, "description": string}],
  "facts": [string],
  "relationships": [{"subject": string, "predicate": string, "object": string}],
  "topics": [string],
  "metadata": {"content_type": string, "language": string, "estimated_word_count": number, "domain": string, "source_quality": "primary"|"secondary"|"tertiary"}
}`;

const CONFIDENCE_SYSTEM = `You are a content structure auditor. Score the ORIGINAL content on 5 dimensions (each 0-20, total 0-100):
1. Heading Hierarchy (0-20): Proper nested headings?
2. Information Architecture (0-20): Logical organization?
3. Scanability (0-20): Lists, tables, bold terms, clear sections?
4. Signal-to-Noise (0-20): Filler content, marketing fluff, repetition?
5. Machine Readability (0-20): Can AI parse effectively? Entities clear? Facts unambiguous?
Respond with valid JSON only — no markdown fences. Schema:
{
  "score": number,
  "rating": "Excellent"|"Good"|"Fair"|"Poor"|"Very Poor",
  "dimensions": {
    "heading_hierarchy": {"score": number, "note": string},
    "information_architecture": {"score": number, "note": string},
    "scanability": {"score": number, "note": string},
    "signal_to_noise": {"score": number, "note": string},
    "machine_readability": {"score": number, "note": string}
  },
  "reasoning": string,
  "improvements": [string]
}`;

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

// ─── Multi-pass pipeline ─────────────────────────────────────────

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
    const content = text.slice(0, 80000);

    // PASS 1: Classify
    const planRaw = await askClaude(
      anthropicApiKey,
      CLASSIFY_SYSTEM,
      `Analyze this content and classify it. Identify its type, domain, audience, main sections, and structural notes.\n\nContent (first 5000 chars):\n${content.slice(0, 5000)}`,
      1024
    );

    let plan;
    try {
      plan = JSON.stringify(JSON.parse(cleanJson(planRaw)), null, 2);
    } catch {
      plan = planRaw;
    }

    // PASS 2, 3, 4: Run in parallel
    const [markdownRaw, knowledgeRaw, confidenceRaw] = await Promise.all([
      askClaude(
        anthropicApiKey,
        MARKDOWN_SYSTEM,
        `Content analysis plan:\n${plan}\n\nRestructure this content into clean, semantic markdown.\n\nContent:\n${content.slice(0, 70000)}`
      ),
      askClaude(
        anthropicApiKey,
        KNOWLEDGE_SYSTEM,
        `Content analysis plan:\n${plan}\n\nExtract a structured knowledge graph. Think step by step.\n\nContent:\n${content.slice(0, 70000)}`
      ),
      askClaude(
        anthropicApiKey,
        CONFIDENCE_SYSTEM,
        `Content analysis plan:\n${plan}\n\nAudit the original content structure. Score each of the 5 dimensions.\n\nOriginal content:\n${content.slice(0, 20000)}`
      ),
    ]);

    const markdown = markdownRaw.trim() || "Failed to generate markdown.";

    let knowledge = {};
    try {
      knowledge = JSON.parse(cleanJson(knowledgeRaw));
    } catch {
      knowledge = { error: "Failed to parse JSON knowledge block" };
    }

    let confidence = { score: 0, rating: "Unknown", reasoning: "Failed to parse", improvements: [] };
    try {
      confidence = JSON.parse(cleanJson(confidenceRaw));
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
