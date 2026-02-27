import { X, ArrowRight, Building2, Calendar, MapPin, DollarSign, Users } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "../../lib/utils";

/**
 * Confidence badge with color coding.
 */
function ConfidenceBadge({ confidence }) {
  if (confidence == null) return null;
  const pct = typeof confidence === "number" ? confidence : 0;
  let color = "bg-[hsl(0,84%,60%)]/20 text-[hsl(0,84%,60%)]";
  if (pct >= 0.8) {
    color = "bg-[hsl(142,71%,45%)]/20 text-[hsl(142,71%,45%)]";
  } else if (pct >= 0.5) {
    color = "bg-[hsl(45,93%,47%)]/20 text-[hsl(45,93%,47%)]";
  }

  return (
    <Badge variant="outline" className={cn("text-[10px] font-mono", color)}>
      {Math.round(pct * 100)}% confidence
    </Badge>
  );
}

/**
 * Slide-in panel from the right showing selected company details.
 * Animates in/out. Contains company name, description, key data points,
 * confidence badge, and a "Deep Dive" button.
 */
export default function CompanySidebar({
  company,
  isOpen = false,
  onClose,
  onDeepDive,
}) {
  if (!company && !isOpen) return null;

  const detail = (Icon, label, value) => {
    if (!value) return null;
    return (
      <div className="flex items-start gap-2.5 py-2 border-b border-[hsl(var(--border))]/50 last:border-0">
        <Icon className="w-3.5 h-3.5 mt-0.5 text-[hsl(var(--muted-foreground))] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-0.5">
            {label}
          </p>
          <p className="text-sm text-[hsl(var(--foreground))]">{value}</p>
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "fixed top-0 right-0 h-full w-80 z-30",
        "bg-[hsl(var(--card))] border-l border-[hsl(var(--border))]",
        "shadow-2xl shadow-black/20",
        "transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))]">
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">
          {company?.name || "Company Details"}
        </h2>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[hsl(var(--muted))] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
        </button>
      </div>

      {/* Content */}
      {company && (
        <ScrollArea className="h-[calc(100%-3.25rem)]">
          <div className="p-4 space-y-4">
            {/* Name and confidence */}
            <div>
              <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] leading-tight">
                {company.name}
              </h3>
              {company.sub_sector && (
                <Badge
                  variant="outline"
                  className="mt-2 text-[10px] text-[hsl(var(--muted-foreground))]"
                >
                  {company.sub_sector}
                </Badge>
              )}
              {company.confidence != null && (
                <div className="mt-2">
                  <ConfidenceBadge confidence={company.confidence} />
                </div>
              )}
            </div>

            {/* Description */}
            {company.description && (
              <p className="text-sm text-[hsl(var(--foreground))]/70 leading-relaxed">
                {company.description}
              </p>
            )}

            {/* Details list */}
            <div className="space-y-0">
              {detail(
                DollarSign,
                "Funding",
                company.funding || company.funding_amount
              )}
              {detail(
                Building2,
                "Stage",
                company.funding_stage || company.stage
              )}
              {detail(
                Calendar,
                "Founded",
                company.founding_year || company.founded
              )}
              {detail(
                MapPin,
                "Headquarters",
                company.headquarters || company.hq
              )}
              {detail(
                Users,
                "Key Investors",
                Array.isArray(company.key_investors)
                  ? company.key_investors.join(", ")
                  : company.key_investors
              )}
            </div>

            {/* Deep Dive button */}
            <Button
              onClick={() => onDeepDive?.(company)}
              className="w-full mt-4 bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,50%)] text-white"
            >
              Deep Dive
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
