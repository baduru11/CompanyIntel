import { useState, useMemo, useCallback } from "react";
import ForceGraph from "./ForceGraph";
import CompanySidebar from "./CompanySidebar";
import FilterChips from "./FilterChips";

/**
 * Determine if a company's funding stage matches a stage filter.
 * Stages: Seed, A, B, C+ (where C+ includes C, D, E, etc.)
 */
function matchesStage(company, stages) {
  if (stages.length === 0) return true;
  const stage = (
    company.funding_stage ||
    company.stage ||
    ""
  ).toLowerCase();
  return stages.some((s) => {
    const sl = s.toLowerCase();
    if (sl === "seed") return stage.includes("seed");
    if (sl === "a") return stage.includes("series a") || stage === "a";
    if (sl === "b") return stage.includes("series b") || stage === "b";
    if (sl === "c+") {
      return /series [c-z]/i.test(stage) || /^[c-z]$/i.test(stage) || stage.includes("ipo") || stage.includes("late");
    }
    return false;
  });
}

/**
 * Determine if a company's founding year matches a year range filter.
 */
function matchesYear(company, years) {
  if (years.length === 0) return true;
  const yr = Number(company.founding_year || company.founded);
  if (!yr) return years.length === 0; // Unknown year only matches if no filter
  return years.some((range) => {
    if (range === "2020+") return yr >= 2020;
    if (range === "2015-19") return yr >= 2015 && yr <= 2019;
    if (range === "2010-14") return yr >= 2010 && yr <= 2014;
    if (range === "Pre-2010") return yr < 2010;
    return false;
  });
}

/**
 * Main Explore mode view. Composes the force graph, filter chips,
 * company sidebar, and a context bar showing sector and company count.
 *
 * Transforms API ExploreReport data into the format needed by ForceGraph.
 */
export default function ExploreView({ data, onDeepDive }) {
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState({
    subSectors: [],
    stages: [],
    years: [],
  });

  // Extract companies from the data
  const allCompanies = useMemo(() => {
    if (!data) return [];
    // Support both data.companies and data.result.companies shapes
    const companies = data.companies || data.result?.companies || [];
    return companies.map((c, i) => ({
      id: c.id || c.name || `company-${i}`,
      name: c.name || "Unknown",
      sub_sector: c.sub_sector || c.sector || "",
      funding_numeric: c.funding_numeric || 0,
      funding: c.funding || c.funding_amount || "",
      funding_stage: c.funding_stage || c.stage || "",
      founding_year: c.founding_year || c.founded || "",
      description: c.description || "",
      confidence: c.confidence ?? null,
      headquarters: c.headquarters || c.hq || "",
      key_investors: c.key_investors || [],
    }));
  }, [data]);

  // Extract unique sub-sectors
  const subSectors = useMemo(() => {
    const set = new Set(allCompanies.map((c) => c.sub_sector).filter(Boolean));
    return [...set].sort();
  }, [allCompanies]);

  // Filter companies based on active filters
  const filteredCompanies = useMemo(() => {
    return allCompanies.filter((c) => {
      // Sub-sector filter
      if (
        activeFilters.subSectors.length > 0 &&
        !activeFilters.subSectors.includes(c.sub_sector)
      ) {
        return false;
      }
      // Stage filter
      if (!matchesStage(c, activeFilters.stages)) return false;
      // Year filter
      if (!matchesYear(c, activeFilters.years)) return false;
      return true;
    });
  }, [allCompanies, activeFilters]);

  // Sector name from data
  const sectorName = data?.sector || data?.query || "Market Landscape";

  const handleNodeClick = useCallback((node) => {
    setSelectedCompany(node);
    setSidebarOpen(true);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
    setSelectedCompany(null);
  }, []);

  const handleDeepDive = useCallback(
    (company) => {
      onDeepDive?.(company);
    },
    [onDeepDive]
  );

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Context bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {sectorName}
          </h2>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {filteredCompanies.length} compan{filteredCompanies.length === 1 ? "y" : "ies"} found
            {filteredCompanies.length !== allCompanies.length && (
              <> (of {allCompanies.length} total)</>
            )}
          </span>
        </div>
      </div>

      {/* Filter chips */}
      <FilterChips
        subSectors={subSectors}
        activeFilters={activeFilters}
        onFilterChange={setActiveFilters}
      />

      {/* Main content area */}
      <div className="flex flex-1 relative overflow-hidden">
        {/* Force graph */}
        <div
          className="flex-1 transition-all duration-300"
          style={{
            marginRight: sidebarOpen ? "320px" : "0",
          }}
        >
          <ForceGraph
            companies={filteredCompanies}
            onNodeClick={handleNodeClick}
            selectedNode={selectedCompany?.id || selectedCompany?.name}
          />
        </div>

        {/* Company sidebar */}
        <CompanySidebar
          company={selectedCompany}
          isOpen={sidebarOpen}
          onClose={handleCloseSidebar}
          onDeepDive={handleDeepDive}
        />
      </div>
    </div>
  );
}
