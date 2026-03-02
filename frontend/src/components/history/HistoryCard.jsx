import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { cn } from "../../lib/utils";

/**
 * Card showing a past query result in the history grid.
 * Displays mode badge, query name, and cached date.
 * Hover effect with subtle scale and border highlight.
 */
export default function HistoryCard({ report, onSelect, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mode = report.mode || "explore";
  const isDeepDive = mode === "deep_dive";

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => !confirmDelete && onSelect?.(report)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!confirmDelete) onSelect?.(report);
        }
      }}
      className={cn(
        "group relative cursor-pointer transition-all duration-200 p-4 space-y-3",
        "hover:scale-[1.02] hover:shadow-md",
        "hover:border-[hsl(217,91%,60%)]/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(217,91%,60%)]"
      )}
    >
      {/* Top row: mode badge + delete button */}
      <div className="flex items-start justify-between gap-2">
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] font-medium",
            isDeepDive
              ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
              : "bg-[hsl(217,91%,60%)]/15 text-[hsl(217,91%,60%)] border-[hsl(217,91%,60%)]/30"
          )}
        >
          {isDeepDive ? "Deep Dive" : "Explore"}
        </Badge>

        {/* Delete control */}
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-red-400">Delete?</span>
            <button
              type="button"
              className="text-[10px] font-semibold text-red-400 hover:text-red-300 px-1"
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(report.filename);
              }}
            >
              Yes
            </button>
            <button
              type="button"
              className="text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] px-1"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(false);
              }}
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label="Delete report"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-[hsl(var(--muted-foreground))] hover:text-red-400"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDelete(true);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Query name */}
      <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] leading-snug line-clamp-2 group-hover:text-[hsl(217,91%,60%)] transition-colors">
        {report.query || "Untitled Query"}
      </h3>

      {/* Date */}
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        {formatDate(report.cached_at)}
      </p>
    </Card>
  );
}
