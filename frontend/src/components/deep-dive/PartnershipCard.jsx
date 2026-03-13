import { Handshake, ExternalLink } from "lucide-react";
import { cn } from "../../lib/utils";

const typeBadgeStyles = {
  strategic: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  customer: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  technology: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  distribution: "bg-amber-500/15 text-amber-400 border-amber-500/20",
};

export default function PartnershipCard({ partnership }) {
  if (!partnership) return null;

  const {
    partner_name,
    type,
    description,
    date,
    source_url,
  } = partnership;

  const normalizedType = (type || "").toLowerCase().trim();
  const badgeStyle =
    typeBadgeStyles[normalizedType] ||
    "bg-[hsl(var(--muted))]/30 text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]";

  return (
    <div className="animate-init animate-fade-in-up rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-4 space-y-3 hover:border-[hsl(var(--border))]/80 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="p-1.5 rounded-lg bg-[hsl(var(--muted))]/40 shrink-0 mt-0.5">
            <Handshake className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-[hsl(var(--foreground))] leading-snug">
              {partner_name || "Unknown Partner"}
            </h4>
            {date && (
              <p className="text-xs text-[hsl(var(--muted-foreground))]/70 mt-0.5">
                {date}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {type && (
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium capitalize",
                badgeStyle
              )}
            >
              {type}
            </span>
          )}
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
      </div>
      {description && (
        <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed pl-[2.375rem]">
          {description}
        </p>
      )}
    </div>
  );
}
