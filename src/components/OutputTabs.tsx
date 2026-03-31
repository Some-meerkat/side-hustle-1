"use client";

import { useState } from "react";
import MarkdownView from "./MarkdownView";
import JsonView from "./JsonView";
import ConfidenceView from "./ConfidenceView";

interface OutputTabsProps {
  markdown: string;
  knowledge: Record<string, unknown>;
  confidence: {
    score: number;
    rating: string;
    reasoning: string;
    improvements: string[];
  };
}

const tabs = [
  { id: "markdown", label: "Structured Markdown", icon: "M" },
  { id: "json", label: "Knowledge Block", icon: "{}" },
  { id: "confidence", label: "Confidence", icon: "%" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function OutputTabs({
  markdown,
  knowledge,
  confidence,
}: OutputTabsProps) {
  const [active, setActive] = useState<TabId>("markdown");
  const [copied, setCopied] = useState(false);

  const getContent = () => {
    if (active === "markdown") return markdown;
    return JSON.stringify(active === "json" ? knowledge : confidence, null, 2);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getContent());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (format: "md" | "json") => {
    let content: string;
    let filename: string;
    let mime: string;

    if (format === "md") {
      content = markdown;
      filename = "agent-readable-output.md";
      mime = "text/markdown";
    } else {
      content = JSON.stringify(
        active === "confidence" ? confidence : knowledge,
        null,
        2
      );
      filename =
        active === "confidence"
          ? "confidence-score.json"
          : "knowledge-block.json";
      mime = "application/json";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Tab Bar */}
      <div className="flex border-b border-gray-200 bg-gray-50/50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium transition-all border-b-2 cursor-pointer bg-transparent
              ${
                active === tab.id
                  ? "border-indigo-600 text-indigo-600 bg-white"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
          >
            <span
              className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                active === tab.id
                  ? "bg-indigo-100 text-indigo-600"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {tab.icon}
            </span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-6 max-h-[600px] overflow-y-auto">
        {active === "markdown" && <MarkdownView content={markdown} />}
        {active === "json" && <JsonView data={knowledge} />}
        {active === "confidence" && <ConfidenceView data={confidence} />}
      </div>

      {/* Action Buttons */}
      <div className="border-t border-gray-100 px-6 py-3 bg-gray-50/50 flex justify-end gap-2">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {copied ? "Copied!" : "Copy to Clipboard"}
        </button>
        {active === "markdown" && (
          <button
            onClick={() => handleDownload("md")}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download .md
          </button>
        )}
        {(active === "json" || active === "confidence") && (
          <button
            onClick={() => handleDownload("json")}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download .json
          </button>
        )}
      </div>
    </div>
  );
}
