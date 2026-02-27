import { useState, useEffect, useMemo } from "react";
import { Search, FileText } from "lucide-react";
import { Input } from "../ui/input";
import { fetchHistory } from "../../lib/api";
import { cn } from "../../lib/utils";
import HistoryCard from "./HistoryCard";

/**
 * Landing page grid of past query results.
 * Fetches /api/history on mount, provides search/filter,
 * and renders a responsive grid of HistoryCards.
 */
export default function HistoryGrid({ onSelectReport }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  // Fetch history on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchHistory()
      .then((data) => {
        if (!cancelled) {
          // Support both array and { reports: [] } shapes
          const list = Array.isArray(data) ? data : data.reports || data.results || [];
          setReports(list);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          // Silently handle fetch errors (e.g., backend not running)
          console.warn("Could not fetch history:", err.message);
          setReports([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Filter reports based on search query
  const filteredReports = useMemo(() => {
    if (!search.trim()) return reports;
    const q = search.toLowerCase();
    return reports.filter(
      (r) =>
        (r.query || "").toLowerCase().includes(q) ||
        (r.mode || "").toLowerCase().includes(q)
    );
  }, [reports, search]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
          <div className="w-4 h-4 border-2 border-[hsl(217,91%,60%)] border-t-transparent rounded-full animate-spin" />
          Loading history...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-[hsl(var(--foreground))]">
          Recent Reports
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Browse past queries or start a new one above.
        </p>
      </div>

      {/* Search/filter bar */}
      {reports.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter reports..."
            className={cn(
              "pl-8 h-9 text-sm bg-[hsl(var(--background))]",
              "border-[hsl(var(--border))] focus-visible:ring-[hsl(217,91%,60%)]/40"
            )}
          />
        </div>
      )}

      {/* Grid or empty state */}
      {filteredReports.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReports.map((report, i) => (
            <HistoryCard
              key={report.id || report.cached_at || i}
              report={report}
              onSelect={onSelectReport}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-[hsl(var(--muted))] p-4 mb-4">
            <FileText className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-xs">
            {reports.length === 0
              ? "No reports yet. Start by running a query above."
              : "No reports match your search."}
          </p>
        </div>
      )}
    </div>
  );
}
