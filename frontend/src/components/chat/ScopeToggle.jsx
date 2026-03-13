import { useState, useEffect } from "react";
import { cn } from "../../lib/utils";
import { getApiUrl } from "../../lib/api";

export function ScopeToggle({ scope, onScopeChange }) {
  const [reportCount, setReportCount] = useState(0);

  useEffect(() => {
    fetch(getApiUrl("/api/chat/status"))
      .then((r) => r.json())
      .then((d) => setReportCount(d.indexed_reports || 0))
      .catch(() => {});
  }, []);

  return (
    <div className="relative flex rounded-lg bg-white/[0.04] p-0.5">
      <div
        className={cn(
          "absolute inset-y-0.5 rounded-md bg-primary/20 transition-all duration-300 ease-out",
          scope === "current"
            ? "left-0.5 w-[calc(50%-2px)]"
            : "left-[50%] w-[calc(50%-2px)]",
        )}
      />
      <button
        onClick={() => onScopeChange("current")}
        className={cn(
          "relative z-10 flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
          scope === "current" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        This report
      </button>
      <button
        onClick={() => onScopeChange("all")}
        className={cn(
          "relative z-10 flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
          scope === "all" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        All research
        {reportCount > 1 && (
          <span className="ml-1 text-[10px] text-muted-foreground">
            ({reportCount})
          </span>
        )}
      </button>
    </div>
  );
}
