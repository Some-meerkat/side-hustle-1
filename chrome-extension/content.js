(() => {
  if (document.getElementById("agent-readable-btn")) return;

  const btn = document.createElement("button");
  btn.id = "agent-readable-btn";
  btn.innerHTML = "AR";
  btn.title = "Convert to Agent Readable";
  document.body.appendChild(btn);

  function extractPageContent() {
    // Try to get article/main content first
    const selectors = ["article", "main", '[role="main"]', ".post-content", ".entry-content", ".article-body"];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 200) {
        return el.innerText.trim();
      }
    }

    // Clone body and strip non-content elements
    const clone = document.body.cloneNode(true);
    const remove = ["script", "style", "nav", "footer", "header", "aside", "iframe", "noscript", "#agent-readable-btn"];
    remove.forEach((sel) => {
      clone.querySelectorAll(sel).forEach((el) => el.remove());
    });

    return clone.innerText
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 100000);
  }

  btn.addEventListener("click", async () => {
    btn.classList.add("ar-loading");
    btn.innerHTML = '<div class="ar-spinner"></div>';

    try {
      const text = extractPageContent();
      if (!text || text.length < 50) {
        throw new Error("Not enough content on this page");
      }

      // Send to background script for API call
      chrome.runtime.sendMessage(
        { type: "PROCESS_CONTENT", text },
        (response) => {
          btn.classList.remove("ar-loading");
          btn.innerHTML = "AR";

          if (response?.error) {
            console.error("Agent Readable error:", response.error);
            showToast("Failed: " + response.error);
          }
          // Side panel will be opened by background script
        }
      );
    } catch (err) {
      btn.classList.remove("ar-loading");
      btn.innerHTML = "AR";
      showToast(err.message || "Something went wrong");
    }
  });

  function showToast(msg) {
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed; bottom: 88px; right: 24px; z-index: 2147483647;
      background: #1e1e2e; color: white; padding: 12px 20px; border-radius: 10px;
      font-size: 13px; font-family: -apple-system, sans-serif; max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2); animation: ar-fade 3s forwards;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
})();
