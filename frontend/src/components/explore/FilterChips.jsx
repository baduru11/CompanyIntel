import { cn } from "../../lib/utils";

const FUNDING_STAGES = ["Seed", "A", "B", "C+"];
const YEAR_RANGES = ["2020+", "2015-19", "2010-14", "Pre-2010"];

/**
 * A group of chips for a single filter category.
 */
function ChipGroup({ label, items, category, activeFilters, onToggle }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => {
          const isActive = (activeFilters[category] || []).includes(item);
          return (
            <button
              key={item}
              onClick={() => onToggle(category, item)}
              className={cn(
                "px-2.5 py-1 rounded text-[11px] font-medium transition-all duration-200 cursor-pointer",
                "border",
                isActive
                  ? "bg-[hsl(217,91%,60%)]/15 text-[hsl(217,91%,60%)] border-[hsl(217,91%,60%)]/30"
                  : "bg-transparent text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))] hover:border-[hsl(var(--foreground))]/30 hover:text-[hsl(var(--foreground))]"
              )}
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Row of toggle chips for filtering the force graph.
 * Categories: Sub-sectors, Funding stages, Year ranges.
 * Active filters are highlighted with accent color.
 */
export default function FilterChips({
  subSectors = [],
  activeFilters = { subSectors: [], stages: [], years: [] },
  onFilterChange,
}) {
  const toggle = (category, value) => {
    if (!onFilterChange) return;
    const current = activeFilters[category] || [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onFilterChange({ ...activeFilters, [category]: next });
  };

  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-2 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))]">
      {subSectors.length > 0 && (
        <ChipGroup
          label="Sector"
          items={subSectors}
          category="subSectors"
          activeFilters={activeFilters}
          onToggle={toggle}
        />
      )}
      <div className="w-px h-5 bg-[hsl(var(--border))]" />
      <ChipGroup
        label="Stage"
        items={FUNDING_STAGES}
        category="stages"
        activeFilters={activeFilters}
        onToggle={toggle}
      />
      <div className="w-px h-5 bg-[hsl(var(--border))]" />
      <ChipGroup
        label="Year"
        items={YEAR_RANGES}
        category="years"
        activeFilters={activeFilters}
        onToggle={toggle}
      />
    </div>
  );
}
