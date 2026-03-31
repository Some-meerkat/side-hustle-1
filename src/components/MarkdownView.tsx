"use client";

import ReactMarkdown from "react-markdown";

interface MarkdownViewProps {
  content: string;
}

export default function MarkdownView({ content }: MarkdownViewProps) {
  return (
    <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-600 prose-strong:text-gray-900 prose-li:text-gray-600 prose-blockquote:border-indigo-300 prose-blockquote:text-gray-500 prose-code:text-indigo-600 prose-code:bg-indigo-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
