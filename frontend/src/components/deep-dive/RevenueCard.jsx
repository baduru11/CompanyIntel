import { DollarSign, ExternalLink } from "lucide-react";

const confidenceColors = {
  high: { dot: "bg-emerald-400", text: "text-emerald-400" },
  medium: { dot: "bg-amber-400", text: "text-amber-400" },
  low: { dot: "bg-red-400", text: "text-red-400" },
};

function getConfidenceLevel(confidence) {
  if (confidence == null) return null;
  const val = typeof confidence === "string" ? parseFloat(confidence) : confidence;
  if (val >= 0.7) return "high";
  if (val >= 0.4) return "medium";
  return "low";
}

export default function RevenueCard({ revenue }) {
  if (!revenue) return null;

  const { range, growth_rate, source_url, confidence } = revenue;

  const growthPositive =
    growth_rate != null &&
    (typeof growth_rate === "number" ? growth_rate > 0 : !String(growth_rate).startsWith("-"));

  const confidenceLevel = getConfidenceLevel(confidence);
  const confColors = confidenceLevel
    ? confidenceColors[confidenceLevel]
    : null;

  const confidenceLabel =
    confidence != null
      ? typeof confidence === "number"
        ? `${Math.round(confidence * 100)}%`
        : String(confidence)
      : null;

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 space-y-4 hover-glow transition-all animate-init animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="inline-flex p-2.5 rounded-lg bg-gradient-to-br from-emerald-500/12 to-emerald-600/5">
          <DollarSign className="h-5 w-5 text-emerald-400" />
        </div>
        {source_url && (
          <a
            href={source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-all cursor-pointer"
            title="View source"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Revenue range */}
      <div>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">
          Estimated Revenue
        </p>
        <p className="text-xl font-bold text-[hsl(var(--foreground))] tracking-tight">
          {range || "\u2014"}
        </p>
      </div>

      {/* Growth + Confidence row */}
      <div className="flex items-center gap-3 flex-wrap">
        {growth_rate != null && (
          <span
            className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md border ${
              growthPositive
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                : "border-amber-500/25 bg-amber-500/10 text-amber-400"
            }`}
          >
            {typeof growth_rate === "number"
              ? `${growth_rate > 0 ? "+" : ""}${growth_rate}%`
              : growth_rate}{" "}
            growth
          </span>
        )}

        {confColors && confidenceLabel && (
          <span className="inline-flex items-center gap-1.5 text-[11px]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${confColors.dot}`}
            />
            <span className={confColors.text}>
              {confidenceLabel} confidence
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
