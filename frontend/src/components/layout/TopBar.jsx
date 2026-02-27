import { useState, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { cn } from "../../lib/utils";

/**
 * Compact top bar: logo on left, search input in center,
 * mode toggle (Explore / Deep Dive), and submit button.
 * Bloomberg-style — data-focused, not chatbot-like.
 */
export default function TopBar({ onSubmit, isLoading = false, onLogoClick }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("explore");

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed || isLoading) return;
      onSubmit?.(trimmed, mode);
    },
    [query, mode, isLoading, onSubmit]
  );

  return (
    <header className="flex items-center gap-4 px-4 py-2 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))]">
      {/* Logo — click to return to history */}
      <button
        type="button"
        onClick={onLogoClick}
        className="flex items-center gap-2 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
      >
        <div className="w-7 h-7 rounded bg-[hsl(217,91%,60%)] flex items-center justify-center">
          <span className="text-white text-xs font-bold">CI</span>
        </div>
        <span className="text-sm font-semibold text-[hsl(var(--foreground))] tracking-tight hidden sm:inline">
          CompanyIntel
        </span>
      </button>

      {/* Search form */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 flex-1 max-w-2xl mx-auto"
      >
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. AI infrastructure startups in Series A-B..."
            className={cn(
              "pl-8 h-9 text-sm bg-[hsl(var(--background))]",
              "border-[hsl(var(--border))] focus-visible:ring-[hsl(217,91%,60%)]/40"
            )}
            disabled={isLoading}
          />
        </div>

        {/* Mode toggle */}
        <Tabs value={mode} onValueChange={setMode} className="shrink-0">
          <TabsList className="h-9">
            <TabsTrigger value="explore" className="text-xs px-3 h-7">
              Explore
            </TabsTrigger>
            <TabsTrigger value="deep_dive" className="text-xs px-3 h-7">
              Deep Dive
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Submit */}
        <Button
          type="submit"
          size="sm"
          disabled={isLoading || !query.trim()}
          className="h-9 px-4 bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,50%)] text-white shrink-0"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Query"
          )}
        </Button>
      </form>

      {/* Right spacer for balance */}
      <div className="w-24 shrink-0 hidden sm:block" />
    </header>
  );
}
