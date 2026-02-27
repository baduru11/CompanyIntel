import { useRef, useMemo, useCallback, useEffect, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";

/**
 * Muted color palette for sub-sectors (Bloomberg-style: professional, not neon).
 */
const SUB_SECTOR_COLORS = [
  "#5B8DEF", // steel blue
  "#6FCF97", // sage green
  "#F2994A", // muted orange
  "#BB6BD9", // soft purple
  "#56CCF2", // light cyan
  "#EB5757", // muted red
  "#F2C94C", // muted gold
  "#27AE60", // forest green
  "#9B51E0", // violet
  "#2D9CDB", // azure
];

/**
 * Map sub_sector name to a consistent color from the palette.
 */
function getSectorColor(subSector, sectorMap) {
  if (!subSector) return SUB_SECTOR_COLORS[0];
  if (!sectorMap.has(subSector)) {
    sectorMap.set(subSector, SUB_SECTOR_COLORS[sectorMap.size % SUB_SECTOR_COLORS.length]);
  }
  return sectorMap.get(subSector);
}

/**
 * Map funding_numeric to node radius (min 5, max 30).
 */
function fundingToRadius(funding, maxFunding) {
  if (!funding || !maxFunding) return 8;
  const normalized = Math.min(funding / maxFunding, 1);
  return 5 + normalized * 25;
}

/**
 * Interactive 2D force graph showing companies as nodes.
 * Nodes are sized by funding, colored by sub-sector.
 * Companies in the same sub-sector are linked with faint lines.
 */
export default function ForceGraph({
  companies = [],
  onNodeClick,
  selectedNode,
}) {
  const graphRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const maxFunding = useMemo(() => {
    return Math.max(...companies.map((c) => c.funding_numeric || 0), 1);
  }, [companies]);

  // Build graph data: nodes + links between same sub_sector companies
  const graphData = useMemo(() => {
    const sectorColorMap = new Map();
    const nodes = companies.map((c) => ({
      id: c.id || c.name,
      name: c.name,
      sub_sector: c.sub_sector,
      funding_numeric: c.funding_numeric || 0,
      founding_year: c.founding_year,
      description: c.description,
      confidence: c.confidence,
      funding: c.funding || c.funding_amount,
      funding_stage: c.funding_stage || c.stage,
      headquarters: c.headquarters || c.hq,
      key_investors: c.key_investors,
      // Pre-compute display values
      color: getSectorColor(c.sub_sector, sectorColorMap),
      radius: fundingToRadius(c.funding_numeric, maxFunding),
      initial: c.name ? c.name.charAt(0).toUpperCase() : "?",
    }));

    // Create links between companies in the same sub_sector
    const links = [];
    const bySector = {};
    nodes.forEach((n) => {
      if (!n.sub_sector) return;
      if (!bySector[n.sub_sector]) bySector[n.sub_sector] = [];
      bySector[n.sub_sector].push(n.id);
    });
    Object.values(bySector).forEach((ids) => {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          links.push({ source: ids[i], target: ids[j] });
        }
      }
    });

    return { nodes, links };
  }, [companies, maxFunding]);

  // Custom node renderer
  const nodeCanvasObject = useCallback(
    (node, ctx) => {
      const r = node.radius || 8;
      const isSelected =
        selectedNode && (selectedNode === node.id || selectedNode === node.name);

      // Outer ring
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 2, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected
        ? "rgba(91,141,239,0.5)"
        : `${node.color}33`;
      ctx.fill();

      // Main circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = `${node.color}CC`;
      ctx.fill();

      // Border
      ctx.strokeStyle = isSelected ? "#5B8DEF" : node.color;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // Initial letter
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold ${Math.max(r * 0.7, 8)}px -apple-system, system-ui, sans-serif`;
      ctx.fillText(node.initial, node.x, node.y);
    },
    [selectedNode]
  );

  // Node pointer area for hit detection
  const nodePointerAreaPaint = useCallback((node, color, ctx) => {
    const r = node.radius || 8;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  // Link styling: very faint lines
  const linkColor = useCallback(() => "rgba(255,255,255,0.05)", []);

  const handleNodeHover = useCallback((node) => {
    setHoveredNode(node || null);
    // Change cursor
    const el = containerRef.current;
    if (el) {
      el.style.cursor = node ? "pointer" : "default";
    }
  }, []);

  const handleNodeClick = useCallback(
    (node) => {
      onNodeClick?.(node);
    },
    [onNodeClick]
  );

  // Track mouse for tooltip position
  const handleMouseMove = useCallback((e) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[hsl(var(--background))]"
      onMouseMove={handleMouseMove}
    >
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="transparent"
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={nodePointerAreaPaint}
        linkColor={linkColor}
        linkWidth={0.5}
        onNodeHover={handleNodeHover}
        onNodeClick={handleNodeClick}
        d3AlphaDecay={0.03}
        d3VelocityDecay={0.3}
        warmupTicks={50}
        cooldownTicks={100}
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />

      {/* Tooltip on hover */}
      {hoveredNode && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded-md shadow-lg border border-[hsl(var(--border))] bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))]"
          style={{
            left: tooltipPos.x + 12,
            top: tooltipPos.y - 10,
          }}
        >
          <p className="text-xs font-semibold">{hoveredNode.name}</p>
          {hoveredNode.funding && (
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
              Funding: {hoveredNode.funding}
            </p>
          )}
          {hoveredNode.founding_year && (
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
              Founded: {hoveredNode.founding_year}
            </p>
          )}
          {hoveredNode.sub_sector && (
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
              {hoveredNode.sub_sector}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
