let currentData = null;
let activeTab = "markdown";

// --- Settings ---
const settingsToggle = document.getElementById("settingsToggle");
const settingsPanel = document.getElementById("settingsPanel");
const apiKeyInput = document.getElementById("apiKeyInput");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const keyStatus = document.getElementById("keyStatus");

settingsToggle.addEventListener("click", () => {
  settingsPanel.classList.toggle("visible");
});

// Load existing key
chrome.runtime.sendMessage({ type: "GET_API_KEY" }, (res) => {
  if (res?.apiKey) apiKeyInput.value = res.apiKey;
});

saveKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  chrome.runtime.sendMessage({ type: "SET_API_KEY", apiKey: key }, () => {
    keyStatus.style.display = "block";
    setTimeout(() => (keyStatus.style.display = "none"), 2000);
  });
});

// --- Tabs ---
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    activeTab = tab.dataset.tab;
    document.getElementById("panel-" + activeTab).classList.add("active");
  });
});

// --- Messages from background ---
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "LOADING") {
    showState("loading");
  } else if (msg.type === "RESULT") {
    currentData = msg.data;
    renderResult(msg.data);
    showState("result");
  } else if (msg.type === "ERROR") {
    showError(msg.error);
  }
});

function showState(state) {
  document.getElementById("loadingState").style.display = state === "loading" ? "block" : "none";
  document.getElementById("emptyState").style.display = state === "empty" ? "block" : "none";
  document.getElementById("resultState").style.display = state === "result" ? "block" : "none";
  document.getElementById("errorBox").style.display = "none";
}

function showError(msg) {
  const box = document.getElementById("errorBox");
  box.textContent = msg;
  box.style.display = "block";
  showState("empty");
  box.style.display = "block";
}

// --- Render markdown ---
function renderMarkdown(md) {
  // Simple markdown to HTML converter
  let html = md
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>");

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>(?:<br>)?)+/g, (match) => {
    return "<ul>" + match.replace(/<br>/g, "") + "</ul>";
  });

  return "<p>" + html + "</p>";
}

// --- Render result ---
function renderResult(data) {
  // Markdown
  document.getElementById("markdownContent").innerHTML = renderMarkdown(data.markdown);

  // JSON Knowledge
  const jsonEl = document.getElementById("jsonContent");
  let jsonHtml = "";

  if (data.knowledge.title) {
    jsonHtml += `<div><div class="section-label">Title</div><div style="font-size:16px;font-weight:600;color:#111">${esc(data.knowledge.title)}</div></div>`;
  }
  if (data.knowledge.summary) {
    jsonHtml += `<div><div class="section-label">Summary</div><div style="font-size:12px;color:#555;line-height:1.6">${esc(data.knowledge.summary)}</div></div>`;
  }
  if (data.knowledge.entities?.length) {
    jsonHtml += `<div><div class="section-label">Entities</div>`;
    data.knowledge.entities.forEach((e) => {
      jsonHtml += `<div class="entity-card"><span class="entity-type">${esc(e.type)}</span><div><div class="entity-name">${esc(e.name)}</div><div class="entity-desc">${esc(e.description)}</div></div></div>`;
    });
    jsonHtml += `</div>`;
  }
  if (data.knowledge.facts?.length) {
    jsonHtml += `<div><div class="section-label">Key Facts</div>`;
    data.knowledge.facts.forEach((f) => {
      jsonHtml += `<div class="fact-item"><div class="fact-dot"></div><span>${esc(f)}</span></div>`;
    });
    jsonHtml += `</div>`;
  }
  if (data.knowledge.relationships?.length) {
    jsonHtml += `<div><div class="section-label">Relationships</div>`;
    data.knowledge.relationships.forEach((r) => {
      jsonHtml += `<div style="font-size:12px;color:#555;padding:2px 0"><strong style="color:#111">${esc(r.subject)}</strong> <span style="color:#999">${esc(r.predicate)}</span> <strong style="color:#111">${esc(r.object)}</strong></div>`;
    });
    jsonHtml += `</div>`;
  }
  if (data.knowledge.topics?.length) {
    jsonHtml += `<div><div class="section-label">Topics</div><div>`;
    data.knowledge.topics.forEach((t) => {
      jsonHtml += `<span class="topic-tag">${esc(t)}</span>`;
    });
    jsonHtml += `</div></div>`;
  }
  if (data.knowledge.metadata) {
    jsonHtml += `<div><div class="section-label">Metadata</div><div class="meta-grid">`;
    Object.entries(data.knowledge.metadata).forEach(([k, v]) => {
      jsonHtml += `<div class="meta-item"><div class="meta-key">${esc(k.replace(/_/g, " "))}</div><div class="meta-val">${esc(String(v))}</div></div>`;
    });
    jsonHtml += `</div></div>`;
  }

  jsonHtml += `<div class="raw-json" id="rawJsonToggle">View raw JSON</div><pre class="raw-json-content" id="rawJsonContent">${esc(JSON.stringify(data.knowledge, null, 2))}</pre>`;
  jsonEl.innerHTML = jsonHtml;

  document.getElementById("rawJsonToggle")?.addEventListener("click", () => {
    const content = document.getElementById("rawJsonContent");
    content.style.display = content.style.display === "block" ? "none" : "block";
  });

  // Confidence
  const confEl = document.getElementById("confidenceContent");
  const score = data.confidence.score || 0;
  const colors = getScoreColors(score);
  const circ = 2 * Math.PI * 54;
  const offset = circ - (score / 100) * circ;

  let confHtml = `
    <svg width="140" height="140" class="score-ring" style="transform:rotate(-90deg)">
      <circle cx="70" cy="70" r="54" fill="none" stroke="#f3f4f6" stroke-width="9"/>
      <circle cx="70" cy="70" r="54" fill="none" stroke="${colors.stroke}" stroke-width="9" stroke-linecap="round"
        stroke-dasharray="${circ}" stroke-dashoffset="${offset}" style="transition:stroke-dashoffset 1s ease-out"/>
    </svg>
    <div style="margin-top:-100px;margin-bottom:60px">
      <div class="score-number">${score}</div>
      <div class="score-max">/ 100</div>
    </div>
    <div class="rating-badge" style="background:${colors.bg};color:${colors.text}">${esc(data.confidence.rating)}</div>
    <div class="analysis-box" style="background:${colors.bg}">
      <div class="section-label">Analysis</div>
      <div style="font-size:12px;color:#555;line-height:1.6">${esc(data.confidence.reasoning)}</div>
    </div>
  `;

  if (data.confidence.improvements?.length) {
    confHtml += `<div style="text-align:left"><div class="section-label">Issues Found</div>`;
    data.confidence.improvements.forEach((item, i) => {
      confHtml += `<div class="improvement-item"><span class="improvement-num">${i + 1}</span><span style="font-size:12px;color:#555">${esc(item)}</span></div>`;
    });
    confHtml += `</div>`;
  }

  confEl.innerHTML = confHtml;
}

function getScoreColors(score) {
  if (score >= 80) return { stroke: "#10b981", bg: "#ecfdf5", text: "#065f46" };
  if (score >= 60) return { stroke: "#3b82f6", bg: "#eff6ff", text: "#1e40af" };
  if (score >= 40) return { stroke: "#f59e0b", bg: "#fffbeb", text: "#92400e" };
  if (score >= 20) return { stroke: "#f97316", bg: "#fff7ed", text: "#9a3412" };
  return { stroke: "#ef4444", bg: "#fef2f2", text: "#991b1b" };
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// --- Copy & Download ---
document.getElementById("copyBtn").addEventListener("click", () => {
  if (!currentData) return;
  let content;
  if (activeTab === "markdown") content = currentData.markdown;
  else if (activeTab === "json") content = JSON.stringify(currentData.knowledge, null, 2);
  else content = JSON.stringify(currentData.confidence, null, 2);

  navigator.clipboard.writeText(content);
  const btn = document.getElementById("copyBtn");
  btn.textContent = "Copied!";
  setTimeout(() => (btn.textContent = "Copy"), 1500);
});

document.getElementById("downloadBtn").addEventListener("click", () => {
  if (!currentData) return;
  let content, filename, mime;

  if (activeTab === "markdown") {
    content = currentData.markdown;
    filename = "agent-readable-output.md";
    mime = "text/markdown";
  } else if (activeTab === "json") {
    content = JSON.stringify(currentData.knowledge, null, 2);
    filename = "knowledge-block.json";
    mime = "application/json";
  } else {
    content = JSON.stringify(currentData.confidence, null, 2);
    filename = "confidence-score.json";
    mime = "application/json";
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
});
