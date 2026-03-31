const PROMPT = `You are an expert at restructuring unstructured content into agent-readable formats. Analyze the following content and produce three outputs.

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
`;

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PROCESS_CONTENT") {
    handleProcess(message.text, sender.tab?.id)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    return true; // keep channel open for async response
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

async function handleProcess(text, tabId) {
  // Get API key from storage
  const { anthropicApiKey } = await chrome.storage.sync.get("anthropicApiKey");
  if (!anthropicApiKey) {
    // Open side panel to show settings
    if (tabId) chrome.sidePanel.open({ tabId });
    return { error: "API key not set. Please add your Anthropic API key in the side panel." };
  }

  // Open side panel and send loading state
  if (tabId) {
    chrome.sidePanel.open({ tabId });
    // Small delay to let panel load
    await new Promise((r) => setTimeout(r, 500));
    chrome.runtime.sendMessage({ type: "LOADING" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: PROMPT + text.slice(0, 80000),
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.content?.[0]?.text || "";

    // Parse sections
    const markdownMatch = responseText.match(/===MARKDOWN===([\s\S]*?)===JSON===/);
    const jsonMatch = responseText.match(/===JSON===([\s\S]*?)===CONFIDENCE===/);
    const confidenceMatch = responseText.match(/===CONFIDENCE===([\s\S]*?)$/);

    const markdown = markdownMatch?.[1]?.trim() || "Failed to generate markdown.";

    let knowledge = {};
    try {
      const jsonStr = (jsonMatch?.[1]?.trim() || "{}").replace(/```json\n?/g, "").replace(/```\n?/g, "");
      knowledge = JSON.parse(jsonStr);
    } catch {
      knowledge = { error: "Failed to parse JSON knowledge block" };
    }

    let confidence = { score: 0, rating: "Unknown", reasoning: "Failed to parse", improvements: [] };
    try {
      const confStr = (confidenceMatch?.[1]?.trim() || "{}").replace(/```json\n?/g, "").replace(/```\n?/g, "");
      confidence = JSON.parse(confStr);
    } catch {
      // keep defaults
    }

    const result = { markdown, knowledge, confidence };

    // Send result to side panel
    chrome.runtime.sendMessage({ type: "RESULT", data: result });

    return { success: true };
  } catch (err) {
    chrome.runtime.sendMessage({ type: "ERROR", error: err.message });
    return { error: err.message };
  }
}
