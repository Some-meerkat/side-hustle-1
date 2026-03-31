"use client";

import { useState } from "react";
import FileUpload from "@/components/FileUpload";
import OutputTabs from "@/components/OutputTabs";

type InputMode = "url" | "file";

interface ProcessedOutput {
  markdown: string;
  knowledge: Record<string, unknown>;
  confidence: {
    score: number;
    rating: string;
    reasoning: string;
    improvements: string[];
  };
}

export default function Home() {
  const [mode, setMode] = useState<InputMode>("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [output, setOutput] = useState<ProcessedOutput | null>(null);
  const [stage, setStage] = useState("");

  const handleSubmit = async () => {
    setError("");
    setOutput(null);
    setLoading(true);

    try {
      let text = "";

      if (mode === "url") {
        if (!url.trim()) {
          setError("Please enter a URL");
          setLoading(false);
          return;
        }
        setStage("Fetching URL content...");
        const res = await fetch("/api/fetch-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        text = data.text;
      } else {
        if (!file) {
          setError("Please upload a file");
          setLoading(false);
          return;
        }
        setStage("Extracting text from file...");
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/extract", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        text = data.text;
      }

      setStage("Processing with Claude...");
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setOutput(data);
      setStage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStage("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">AR</span>
            </div>
            <h1 className="text-lg font-semibold text-gray-900">
              Agent Readable
            </h1>
          </div>
          <span className="text-xs text-gray-400 font-medium">
            Powered by Claude
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
            Transform content into
            <br />
            <span className="text-indigo-600">agent-readable formats</span>
          </h2>
          <p className="mt-3 text-gray-500 max-w-lg mx-auto">
            Paste a URL or upload a document. Claude restructures it into clean
            markdown, a JSON knowledge block, and a structure confidence score.
          </p>
        </div>

        {/* Input Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-8">
          {/* Mode Toggle */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit mb-6">
            <button
              onClick={() => {
                setMode("url");
                setError("");
              }}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all cursor-pointer border-none
                ${mode === "url" ? "bg-white text-gray-900 shadow-sm" : "bg-transparent text-gray-500 hover:text-gray-700"}`}
            >
              URL
            </button>
            <button
              onClick={() => {
                setMode("file");
                setError("");
              }}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all cursor-pointer border-none
                ${mode === "file" ? "bg-white text-gray-900 shadow-sm" : "bg-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Upload File
            </button>
          </div>

          {/* URL Input */}
          {mode === "url" && (
            <div className="flex gap-3">
              <input
                type="url"
                placeholder="https://example.com/article"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError("");
                }}
                disabled={loading}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all disabled:opacity-50"
              />
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-6 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 cursor-pointer border-none shrink-0"
              >
                {loading ? "Processing..." : "Convert"}
              </button>
            </div>
          )}

          {/* File Upload */}
          {mode === "file" && (
            <div className="space-y-4">
              <FileUpload
                onFileSelect={(f) => {
                  setFile(f);
                  setError("");
                }}
                disabled={loading}
              />
              <button
                onClick={handleSubmit}
                disabled={loading || !file}
                className="w-full px-6 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 cursor-pointer border-none"
              >
                {loading ? "Processing..." : "Convert"}
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Loading Stage */}
          {loading && stage && (
            <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-100">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-indigo-700 font-medium">{stage}</p>
            </div>
          )}
        </div>

        {/* Output */}
        {output && (
          <OutputTabs
            markdown={output.markdown}
            knowledge={output.knowledge}
            confidence={output.confidence}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 mt-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 text-center">
          <p className="text-xs text-gray-400">
            Agent Readable — Built with Next.js and Claude Sonnet
          </p>
        </div>
      </footer>
    </div>
  );
}
