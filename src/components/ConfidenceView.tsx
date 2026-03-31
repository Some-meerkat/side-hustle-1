"use client";

interface Dimension {
  score: number;
  note: string;
}

interface ConfidenceData {
  score: number;
  rating: string;
  reasoning: string;
  improvements: string[];
  dimensions?: {
    heading_hierarchy?: Dimension;
    information_architecture?: Dimension;
    scanability?: Dimension;
    signal_to_noise?: Dimension;
    machine_readability?: Dimension;
  };
}

interface ConfidenceViewProps {
  data: ConfidenceData;
}

const DIMENSION_LABELS: Record<string, { label: string; icon: string }> = {
  heading_hierarchy: { label: "Heading Hierarchy", icon: "H" },
  information_architecture: { label: "Information Architecture", icon: "IA" },
  scanability: { label: "Scanability", icon: "SC" },
  signal_to_noise: { label: "Signal-to-Noise", icon: "SN" },
  machine_readability: { label: "Machine Readability", icon: "MR" },
};

export default function ConfidenceView({ data }: ConfidenceViewProps) {
  const { score, rating, reasoning, improvements, dimensions } = data;

  const getColor = (s: number, max = 100) => {
    const pct = (s / max) * 100;
    if (pct >= 80) return { ring: "text-emerald-500", bg: "bg-emerald-50", badge: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" };
    if (pct >= 60) return { ring: "text-blue-500", bg: "bg-blue-50", badge: "bg-blue-100 text-blue-700", bar: "bg-blue-500" };
    if (pct >= 40) return { ring: "text-amber-500", bg: "bg-amber-50", badge: "bg-amber-100 text-amber-700", bar: "bg-amber-500" };
    if (pct >= 20) return { ring: "text-orange-500", bg: "bg-orange-50", badge: "bg-orange-100 text-orange-700", bar: "bg-orange-500" };
    return { ring: "text-red-500", bg: "bg-red-50", badge: "bg-red-100 text-red-700", bar: "bg-red-500" };
  };

  const colors = getColor(score);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Score Ring */}
      <div className="relative">
        <svg width="160" height="160" className="-rotate-90">
          <circle cx="80" cy="80" r="54" fill="none" stroke="#f3f4f6" strokeWidth="10" />
          <circle
            cx="80" cy="80" r="54" fill="none"
            className={colors.ring}
            stroke="currentColor" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold text-gray-900">{score}</span>
          <span className="text-xs text-gray-400 font-medium">/ 100</span>
        </div>
      </div>

      {/* Rating Badge */}
      <span className={`px-4 py-1.5 rounded-full text-sm font-semibold ${colors.badge}`}>
        {rating}
      </span>

      {/* Dimension Breakdown */}
      {dimensions && (
        <div className="w-full">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Dimension Breakdown
          </h4>
          <div className="space-y-3">
            {Object.entries(dimensions).map(([key, dim]) => {
              if (!dim) return null;
              const info = DIMENSION_LABELS[key] || { label: key, icon: "?" };
              const dimColors = getColor(dim.score, 20);
              return (
                <div key={key} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">
                        {info.icon}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{info.label}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-700">{dim.score}/20</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-gray-200 rounded-full mb-1.5">
                    <div
                      className={`h-full rounded-full ${dimColors.bar} transition-all duration-700`}
                      style={{ width: `${(dim.score / 20) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500">{dim.note}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reasoning */}
      <div className={`w-full p-5 rounded-xl ${colors.bg}`}>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Overall Analysis
        </h4>
        <p className="text-sm text-gray-700 leading-relaxed">{reasoning}</p>
      </div>

      {/* Improvements */}
      {improvements && improvements.length > 0 && (
        <div className="w-full">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Issues Found in Original
          </h4>
          <div className="space-y-2">
            {improvements.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                <span className="shrink-0 w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-gray-600">{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
