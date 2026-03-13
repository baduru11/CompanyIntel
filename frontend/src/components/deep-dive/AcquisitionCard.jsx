import { ExternalLink } from "lucide-react";

export default function AcquisitionCard({ acquisition }) {
  if (!acquisition) return null;

  const {
    acquired_company,
    date,
    amount,
    rationale,
    source_url,
  } = acquisition;

  return (
    <div className="animate-init animate-fade-in-up rounded-xl border-l-[3px] border-l-blue-500/50 border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-4 space-y-2 hover:border-[hsl(var(--border))]/80 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-semibold text-[hsl(var(--foreground))] leading-snug">
            {acquired_company || "Unknown Company"}
          </h4>
          <div className="flex items-center gap-3 mt-1">
            {date && (
              <span className="text-xs text-[hsl(var(--muted-foreground))]/70 tabular-nums">
                {date}
              </span>
            )}
            {date && amount && (
              <span className="text-[hsl(var(--muted-foreground))]/30 text-xs">
                &middot;
              </span>
            )}
            {amount && (
              <span className="text-xs font-medium text-blue-400 tabular-nums">
                {amount}
              </span>
            )}
          </div>
        </div>
        {source_url && (
          <a
            href={source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 p-1.5 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-all cursor-pointer"
            title="View source"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {rationale && (
        <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
          {rationale}
        </p>
      )}
    </div>
  );
}
