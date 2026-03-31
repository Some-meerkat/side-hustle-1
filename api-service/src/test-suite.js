import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { processContent, extractFromUrl } from "./pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, "..", "test-results");
const isQuick = process.argv.includes("--quick");

// ─── Test Cases ──────────────────────────────────────────────────

const TEST_CASES = [
  {
    name: "Wikipedia Article",
    url: "https://en.wikipedia.org/wiki/Large_language_model",
    type: "reference",
    expect: { minEntities: 3, minFacts: 3, scoreRange: [30, 80] },
  },
  {
    name: "Technical Blog Post",
    url: "https://blog.rust-lang.org/2025/02/20/Rust-1.85.0.html",
    type: "blog_post",
    expect: { minEntities: 2, minFacts: 2, scoreRange: [40, 90] },
  },
  {
    name: "Product Landing Page",
    url: "https://stripe.com/payments",
    type: "product_page",
    expect: { minEntities: 1, minFacts: 1, scoreRange: [20, 70] },
  },
  {
    name: "News Article",
    url: "https://www.reuters.com/technology/",
    type: "news",
    expect: { minEntities: 2, minFacts: 2, scoreRange: [30, 80] },
  },
  {
    name: "API Documentation",
    url: "https://docs.anthropic.com/en/docs/about-claude/models",
    type: "documentation",
    expect: { minEntities: 2, minFacts: 3, scoreRange: [50, 95] },
  },
  {
    name: "Government/Legal Page",
    url: "https://www.usa.gov/about-the-us",
    type: "reference",
    expect: { minEntities: 2, minFacts: 2, scoreRange: [30, 80] },
  },
  {
    name: "Academic/Research",
    url: "https://arxiv.org/abs/2303.08774",
    type: "research_paper",
    expect: { minEntities: 2, minFacts: 2, scoreRange: [30, 80] },
  },
  {
    name: "Tutorial/How-to",
    url: "https://react.dev/learn/thinking-in-react",
    type: "tutorial",
    expect: { minEntities: 1, minFacts: 2, scoreRange: [50, 95] },
  },
];

// Use fewer tests in quick mode
const cases = isQuick ? TEST_CASES.slice(0, 3) : TEST_CASES;

// ─── Schema Validation ──────────────────────────────────────────

function validateKnowledge(knowledge) {
  const errors = [];
  if (typeof knowledge !== "object") return ["Knowledge is not an object"];
  if (knowledge.error) return [`Knowledge parse error: ${knowledge.error}`];

  if (!knowledge.title || typeof knowledge.title !== "string") errors.push("Missing or invalid 'title'");
  if (!knowledge.summary || typeof knowledge.summary !== "string") errors.push("Missing or invalid 'summary'");

  if (!Array.isArray(knowledge.entities)) {
    errors.push("Missing 'entities' array");
  } else {
    for (const e of knowledge.entities) {
      if (!e.name || !e.type || !e.description) errors.push(`Entity missing fields: ${JSON.stringify(e)}`);
    }
  }

  if (!Array.isArray(knowledge.facts)) errors.push("Missing 'facts' array");
  if (!Array.isArray(knowledge.relationships)) errors.push("Missing 'relationships' array");
  if (!Array.isArray(knowledge.topics)) errors.push("Missing 'topics' array");

  if (!knowledge.metadata || typeof knowledge.metadata !== "object") {
    errors.push("Missing 'metadata' object");
  }

  return errors;
}

function validateConfidence(confidence) {
  const errors = [];
  if (typeof confidence !== "object") return ["Confidence is not an object"];

  if (typeof confidence.score !== "number" || confidence.score < 0 || confidence.score > 100) {
    errors.push(`Invalid score: ${confidence.score}`);
  }

  const validRatings = ["Excellent", "Good", "Fair", "Poor", "Very Poor"];
  if (!validRatings.includes(confidence.rating)) errors.push(`Invalid rating: ${confidence.rating}`);

  if (!confidence.reasoning || typeof confidence.reasoning !== "string") errors.push("Missing 'reasoning'");
  if (!Array.isArray(confidence.improvements)) errors.push("Missing 'improvements' array");

  if (confidence.dimensions) {
    const expectedDims = ["heading_hierarchy", "information_architecture", "scanability", "signal_to_noise", "machine_readability"];
    for (const dim of expectedDims) {
      if (!confidence.dimensions[dim]) {
        errors.push(`Missing dimension: ${dim}`);
      } else {
        const d = confidence.dimensions[dim];
        if (typeof d.score !== "number" || d.score < 0 || d.score > 20) {
          errors.push(`Dimension '${dim}' has invalid score: ${d.score}`);
        }
        if (!d.note) errors.push(`Dimension '${dim}' missing note`);
      }
    }
  } else {
    errors.push("Missing 'dimensions' object");
  }

  return errors;
}

function validateMarkdown(markdown) {
  const errors = [];
  if (!markdown || markdown.length < 50) errors.push("Markdown too short");
  if (!markdown.includes("#")) errors.push("No headings found in markdown");
  return errors;
}

// ─── Run Tests ───────────────────────────────────────────────────

async function runTests() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Agent Readable Test Suite`);
  console.log(`  ${cases.length} test cases | ${isQuick ? "quick" : "full"} mode`);
  console.log(`${"=".repeat(60)}\n`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(RESULTS_DIR, `run-${timestamp}`);
  fs.mkdirSync(runDir, { recursive: true });

  const summary = [];
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    console.log(`[${i + 1}/${cases.length}] ${tc.name} (${tc.url})`);

    const start = Date.now();
    const result = { name: tc.name, url: tc.url, expectedType: tc.type };

    try {
      // Extract
      process.stdout.write("  Extracting...");
      const { text, metadata } = await extractFromUrl(tc.url);
      process.stdout.write(` ${text.length} chars\n`);

      // Process
      process.stdout.write("  Processing (4 passes)...");
      const output = await processContent(text, metadata);
      const duration = Date.now() - start;
      process.stdout.write(` ${duration}ms\n`);

      // Validate
      const markdownErrors = validateMarkdown(output.markdown);
      const knowledgeErrors = validateKnowledge(output.knowledge);
      const confidenceErrors = validateConfidence(output.confidence);
      const allErrors = [...markdownErrors, ...knowledgeErrors, ...confidenceErrors];

      // Check expectations
      if (tc.expect) {
        const entities = output.knowledge.entities?.length || 0;
        const facts = output.knowledge.facts?.length || 0;
        const score = output.confidence.score || 0;

        if (entities < tc.expect.minEntities) allErrors.push(`Expected >= ${tc.expect.minEntities} entities, got ${entities}`);
        if (facts < tc.expect.minFacts) allErrors.push(`Expected >= ${tc.expect.minFacts} facts, got ${facts}`);
        if (tc.expect.scoreRange && (score < tc.expect.scoreRange[0] || score > tc.expect.scoreRange[1])) {
          allErrors.push(`Score ${score} outside expected range [${tc.expect.scoreRange[0]}, ${tc.expect.scoreRange[1]}]`);
        }
      }

      const status = allErrors.length === 0 ? "PASS" : "WARN";
      if (status === "PASS") passed++;
      else failed++;

      console.log(`  ${status === "PASS" ? "\u2705" : "\u26A0\uFE0F"} ${status} | Score: ${output.confidence.score} | Entities: ${output.knowledge.entities?.length || 0} | Facts: ${output.knowledge.facts?.length || 0} | ${duration}ms`);
      if (allErrors.length > 0) {
        allErrors.forEach((e) => console.log(`     - ${e}`));
      }

      result.status = status;
      result.duration_ms = duration;
      result.errors = allErrors;
      result.stats = {
        markdown_length: output.markdown.length,
        entities: output.knowledge.entities?.length || 0,
        facts: output.knowledge.facts?.length || 0,
        relationships: output.knowledge.relationships?.length || 0,
        topics: output.knowledge.topics?.length || 0,
        confidence_score: output.confidence.score,
        confidence_rating: output.confidence.rating,
      };

      // Save individual result
      const safeName = tc.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      fs.writeFileSync(
        path.join(runDir, `${safeName}.json`),
        JSON.stringify({ ...result, output }, null, 2)
      );

    } catch (err) {
      failed++;
      console.log(`  \u274C FAIL | ${err.message}`);
      result.status = "FAIL";
      result.error = err.message;
      result.duration_ms = Date.now() - start;
    }

    summary.push(result);
    console.log();
  }

  // Write summary
  const summaryData = {
    timestamp,
    mode: isQuick ? "quick" : "full",
    total: cases.length,
    passed,
    failed,
    results: summary,
  };

  fs.writeFileSync(
    path.join(runDir, "_summary.json"),
    JSON.stringify(summaryData, null, 2)
  );

  // Print summary
  console.log(`${"=".repeat(60)}`);
  console.log(`  Results: ${passed} passed, ${failed} warnings/failures out of ${cases.length}`);
  console.log(`  Saved to: ${runDir}`);
  console.log(`${"=".repeat(60)}\n`);
}

runTests().catch((err) => {
  console.error("Test suite crashed:", err);
  process.exit(1);
});
