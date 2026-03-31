"use client";

interface KnowledgeBlock {
  title?: string;
  summary?: string;
  entities?: Array<{ name: string; type: string; description: string }>;
  facts?: string[];
  relationships?: Array<{ subject: string; predicate: string; object: string }>;
  topics?: string[];
  metadata?: {
    content_type?: string;
    language?: string;
    estimated_word_count?: number;
    domain?: string;
  };
  error?: string;
}

interface JsonViewProps {
  data: KnowledgeBlock;
}

export default function JsonView({ data }: JsonViewProps) {
  if (data.error) {
    return <p className="text-red-500 text-sm">{data.error}</p>;
  }

  return (
    <div className="space-y-6">
      {/* Title & Summary */}
      {data.title && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Title
          </h3>
          <p className="text-lg font-semibold text-gray-900">{data.title}</p>
        </div>
      )}
      {data.summary && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Summary
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            {data.summary}
          </p>
        </div>
      )}

      {/* Entities */}
      {data.entities && data.entities.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Entities
          </h3>
          <div className="grid gap-2">
            {data.entities.map((e, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100"
              >
                <span className="shrink-0 px-2 py-0.5 text-[11px] font-semibold uppercase rounded-full bg-indigo-100 text-indigo-700">
                  {e.type}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{e.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {e.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Facts */}
      {data.facts && data.facts.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Key Facts
          </h3>
          <ul className="space-y-1.5">
            {data.facts.map((f, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-gray-600"
              >
                <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Relationships */}
      {data.relationships && data.relationships.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Relationships
          </h3>
          <div className="space-y-1.5">
            {data.relationships.map((r, i) => (
              <div key={i} className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">{r.subject}</span>{" "}
                <span className="text-gray-400">{r.predicate}</span>{" "}
                <span className="font-medium text-gray-900">{r.object}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Topics */}
      {data.topics && data.topics.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Topics
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.topics.map((t, i) => (
              <span
                key={i}
                className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 border border-gray-200"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      {data.metadata && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Metadata
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(data.metadata).map(([k, v]) => (
              <div key={k} className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-[11px] text-gray-400 uppercase">{k.replace(/_/g, " ")}</p>
                <p className="text-sm font-medium text-gray-900">{String(v)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw JSON toggle */}
      <details className="group">
        <summary className="text-xs font-medium text-gray-400 cursor-pointer hover:text-gray-600 transition-colors">
          View raw JSON
        </summary>
        <pre className="mt-2 p-4 rounded-lg bg-gray-900 text-gray-100 text-xs overflow-x-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
