import { ExternalLink } from "lucide-react";
import { cn } from "../../lib/utils";

export default function PatentTable({ patents = [] }) {
  if (patents.length === 0) {
    return (
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        No patent data available.
      </p>
    );
  }

  return (
    <div className="animate-init animate-fade-in-up overflow-x-auto rounded-xl border border-[hsl(var(--border))] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30">
            <th className="py-2.5 px-4 text-left text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Title
            </th>
            <th className="py-2.5 px-4 text-left text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Filing Date
            </th>
            <th className="py-2.5 px-4 text-left text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Status
            </th>
            <th className="py-2.5 px-4 text-left text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Domain
            </th>
          </tr>
        </thead>
        <tbody>
          {patents.map((patent, i) => (
            <tr
              key={patent.patent_number || i}
              className={cn(
                "group border-b border-[hsl(var(--border))]/30 last:border-0 transition-colors hover:bg-[hsl(var(--accent))]/30",
                i % 2 === 0 ? "bg-transparent" : "bg-[hsl(var(--muted))]/15"
              )}
            >
              <td className="py-3 px-4 text-[hsl(var(--foreground))] max-w-sm">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium leading-snug">
                      {patent.title || "Untitled"}
                    </span>
                    {patent.patent_number && (
                      <span className="text-[10px] text-[hsl(var(--muted-foreground))] block mt-0.5">
                        {patent.patent_number}
                      </span>
                    )}
                  </div>
                  {patent.source_url && (
                    <a
                      href={patent.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 p-1 rounded-md text-[hsl(var(--muted-foreground))] opacity-0 group-hover:opacity-100 hover:text-[hsl(var(--primary))] transition-all cursor-pointer"
                      title="View source"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </td>
              <td className="py-3 px-4 text-[hsl(var(--muted-foreground))] whitespace-nowrap tabular-nums">
                {patent.filing_date || "\u2014"}
              </td>
              <td className="py-3 px-4 whitespace-nowrap">
                <StatusBadge status={patent.status} />
              </td>
              <td className="py-3 px-4 text-[hsl(var(--muted-foreground))]">
                {patent.domain || "\u2014"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }) {
  const normalized = (status || "").toLowerCase().trim();
  const isGranted = normalized === "granted";
  const isPending = normalized === "pending";

  const dotColor = isGranted
    ? "bg-emerald-400"
    : isPending
    ? "bg-amber-400"
    : "bg-zinc-400";

  const textColor = isGranted
    ? "text-emerald-400"
    : isPending
    ? "text-amber-400"
    : "text-[hsl(var(--muted-foreground))]";

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", textColor)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />
      {status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : "\u2014"}
    </span>
  );
}
